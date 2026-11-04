"""Meta Model API calls for streak-lab. Shapes per dev.meta.ai docs (Oct 2026):

  Muse Image generate: POST /v1/images/generations
      {model, prompt, n, size, response_format, output_format}
      -> data[].b64_json (docs: /docs/image-generation#generate)
  Muse Image edit: POST /v1/images/edits (Meta JSON shape over raw HTTP)
      {model, prompt, images:[{image_url: dataURL}], n}
      -> data[].b64_json (docs: /docs/image-generation#edit)
  SAM 3.1: POST /v1/responses, stream=true
      {model:"sam-3.1", input:[{type:"message",role:"user",
        content:[{type:"input_text",text:"noun phrase"},
                 {type:"input_image",image_url:dataURL}]}],
       metadata:{mask_encoding:"one_bit"}}
      -> SSE; accumulate response.output_text.delta events until
         response.completed; output_text is one <Nf> line per frame.
         (docs: /docs/sam/overview, /docs/sam/segmenting, /docs/sam/reading-segmentation)
  Spark teacher: POST /v1/chat/completions (OpenAI-compatible, iseeme-verified)
      {model:"muse-spark-1.3", messages:[...], max_tokens, reasoning_effort, temperature}
      -> choices[0].message.content + usage{prompt_tokens, completion_tokens}

Keys and media bytes are never logged; only sizes, token counts, and costs.
"""
import base64
import io
import json
import sys
import urllib.request
import urllib.error

from config import get_config, require_key
import costs

_cfg = get_config()
BASE = _cfg["META_API_BASE"].rstrip("/")
IMAGE_MODEL = _cfg["META_MODEL_IMAGE"]
SAM_MODEL = _cfg["META_MODEL_SAM"]
TEACHER_MODEL = _cfg["META_MODEL_TEACHER"]


def _key():
    return require_key(_cfg)


def _post_json(path, payload, timeout=300):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        BASE + path, data=data,
        headers={"Authorization": "Bearer " + _key(), "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", "replace")
        except Exception:
            body = ""
        try:
            return e.code, json.loads(body)
        except ValueError:
            return e.code, {"error": body[:1500] or f"HTTP {e.code}"}
    except Exception as e:
        return 0, {"error": f"{type(e).__name__}: {e}"}


def _ok(status, out, what):
    if status != 200 or not isinstance(out, dict) or out.get("error"):
        raise RuntimeError(f"{what} failed (HTTP {status}): {str(out)[:800]}")


def images_generate(prompt, detail, size="1024x1024", output_format="png", n=1):
    """Generate photo-realistic test images. Returns list of raw image bytes."""
    status, out = _post_json("/images/generations", {
        "model": IMAGE_MODEL, "prompt": prompt, "n": n,
        "size": size, "response_format": "b64_json", "output_format": output_format,
    })
    _ok(status, out, "images/generations")
    blobs = [base64.b64decode(item["b64_json"]) for item in out.get("data", [])]
    usage = out.get("usage") or {}
    costs.log_call("images/generations", IMAGE_MODEL, detail,
                   in_tokens=usage.get("input_tokens", 0),
                   out_tokens=usage.get("output_tokens", 0), images=len(blobs))
    sys.stderr.write(f"meta: generated {len(blobs)} image(s) [{detail}]\n")
    return blobs


def images_edit(image_bytes, mime, prompt, detail, output_format="png"):
    """Photo -> line art via Meta JSON edits shape. Returns raw image bytes."""
    data_url = "data:%s;base64,%s" % (mime, base64.b64encode(image_bytes).decode("ascii"))
    status, out = _post_json("/images/edits", {
        "model": IMAGE_MODEL, "prompt": prompt,
        "images": [{"image_url": data_url}], "n": 1,
        "response_format": "b64_json", "output_format": output_format,
    }, timeout=600)
    _ok(status, out, "images/edits")
    blob = base64.b64decode(out["data"][0]["b64_json"])
    usage = out.get("usage") or {}
    costs.log_call("images/edits", IMAGE_MODEL, detail,
                   in_tokens=usage.get("input_tokens", 0),
                   out_tokens=usage.get("output_tokens", 0), images=1)
    sys.stderr.write(f"meta: edited 1 image ({len(image_bytes)}->{len(blob)} bytes) [{detail}]\n")
    return blob


def sam_segment(image_bytes, mime, concept, detail):
    """Segment one concept in one image. Returns raw output_text (one <0f> line)."""
    data_url = "data:%s;base64,%s" % (mime, base64.b64encode(image_bytes).decode("ascii"))
    payload = {
        "model": SAM_MODEL,
        "input": [{"type": "message", "role": "user", "content": [
            {"type": "input_text", "text": concept},
            {"type": "input_image", "image_url": data_url},
        ]}],
        "stream": True,
        "metadata": {"mask_encoding": "one_bit"},
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        BASE + "/responses", data=data,
        headers={"Authorization": "Bearer " + _key(), "Content-Type": "application/json",
                 "Accept": "text/event-stream"},
        method="POST",
    )
    deltas = []
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            buf = io.TextIOWrapper(r, encoding="utf-8", errors="replace")
            for line in buf:
                line = line.strip()
                if not line.startswith("data:"):
                    continue
                chunk = line[5:].strip()
                if chunk == "[DONE]":
                    break
                try:
                    ev = json.loads(chunk)
                except ValueError:
                    continue
                if ev.get("type") == "response.output_text.delta":
                    deltas.append(ev.get("delta", ""))
                elif ev.get("type") == "response.completed":
                    break
                elif ev.get("type") == "response.failed":
                    raise RuntimeError(f"SAM failed: {str(ev)[:500]}")
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", "replace")
        except Exception:
            body = ""
        raise RuntimeError(f"SAM failed (HTTP {e.code}): {body[:800]}")
    text = "".join(deltas)
    costs.log_call("responses/sam", SAM_MODEL, f"{detail} concept={concept!r}", images=1)
    sys.stderr.write(f"meta: sam concept={concept!r} output_chars={len(text)} [{detail}]\n")
    return text


def chat_completion(messages, detail, max_tokens=8000, temperature=0.2,
                    reasoning_effort="low", timeout=600):
    """Spark text/vision call. Returns (content_text, usage_dict). Empty-safe."""
    status, out = _post_json("/chat/completions", {
        "model": TEACHER_MODEL, "messages": messages,
        "max_tokens": max_tokens, "temperature": temperature,
        "reasoning_effort": reasoning_effort,
    }, timeout=timeout)
    _ok(status, out, "chat/completions")
    usage = out.get("usage") or {}
    costs.log_call("chat/completions", TEACHER_MODEL, detail,
                   in_tokens=usage.get("prompt_tokens", 0),
                   out_tokens=usage.get("completion_tokens", 0))
    try:
        text = (out["choices"][0]["message"].get("content") or "")
    except (KeyError, IndexError, TypeError):
        text = ""
    sys.stderr.write(f"meta: chat [{detail}] in={usage.get('prompt_tokens', '?')} "
                     f"out={usage.get('completion_tokens', '?')} chars={len(text)}\n")
    return text, usage
