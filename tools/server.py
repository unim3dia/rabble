"""Rabble local server: serves app/ and turns a selfie into a Rabble person.

One shared pile for everyone who opens it (see room.py):
GET  /api/events?since=N&v=VIEWER  what happened in the pile since N (long-poll)
POST /api/join     {"figure": id or null} -> {"id", "token"}
POST /api/leave    {"token"}
POST /api/say      {"text", "token"} -> {"sid", "text"}: checked, then everyone sees it as written
GET  /api/figure/ID  a selfie figure, so others in the pile can see you
POST /api/selfie  body: {"image": "data:image/jpeg;base64,..."}
  1. Muse Image redraws the photo as a Rabble person, exactly as they are,
     on a flat green background.
  2. greenscreen.py keys out the green (clean, soft edges; no SAM rim).
  -> {"image": "data:image/png;base64,...", "figure": id}
Photos stay in memory only; nothing is written to disk or logged. The made
figure is kept in memory while you're in the pile, so others can see you.
The Meta key stays server-side (see config.py).

Run: python tools/server.py  (http://127.0.0.1:8130)
"""
import base64
import io
import json
import os
import sys
import threading
from urllib.parse import parse_qs, urlparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import meta_api  # noqa: E402
import greenscreen  # noqa: E402
import whispers  # noqa: E402
import chat  # noqa: E402
import room  # noqa: E402
import limits  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "app")
PORT = int(os.environ.get("RABBLE_PORT") or os.environ.get("PORT") or "8130")
HOST = os.environ.get("RABBLE_HOST", "127.0.0.1")
# Behind a host's proxy, the header that proxy sets to the visitor's address
# (e.g. CF-Connecting-IP on Render). Unset anywhere else: headers could be made up.
CLIENT_IP_HEADER = os.environ.get("RABBLE_CLIENT_IP_HEADER", "")
MAX_BODY = 8 * 1024 * 1024
MAX_PIXELS = 4096 * 4096
SELFIES_AT_ONCE = threading.BoundedSemaphore(2)   # photo jobs running at the same time
SLOW_DOWN = "slow down a little, try again soon"

SELFIE_PROMPT = (
    "Redraw this exact person as a single small, squishy, chunky clay figurine, full body, standing, "
    "facing us. Keep them exactly as they are in the photo: the same age, face, skin tone, hair color "
    "and hairstyle, facial hair, glasses, head covering and clothing colors. Do not make them older, "
    "do not add grey or white hair. Only the proportions are toy-like: big round head, soft round body, "
    "short stubby arms and legs, little feet, rosy cheeks. Fully clothed. Soft matte clay look, gentle "
    "even light. Background: perfectly flat, solid pure green (#00FF00) filling the whole frame, no "
    "shadow on it, no floor, no gradient. Nothing green on the figure itself. Whole body visible with "
    "space around it, no other people, nothing else in the frame."
)


def png_bytes(img):
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def read_photo(body):
    """The request's data URL as a checked RGB image; raises if it isn't one."""
    data_url = json.loads(body)["image"]
    if not data_url.startswith("data:image/"):
        raise ValueError("expected an image")
    photo = Image.open(io.BytesIO(base64.b64decode(data_url.split(",", 1)[1])))
    # Opening reads only the header: refuse huge pictures before decoding any pixels.
    if photo.width * photo.height > MAX_PIXELS:
        raise ValueError("photo too large")
    photo.draft("RGB", (1024, 1024))          # JPEGs decode straight at a smaller size
    return photo.convert("RGB")


def selfie_to_rabble(photo):
    photo = photo.copy()
    photo.thumbnail((1024, 1024))
    made = meta_api.images_edit(png_bytes(photo), "image/png", SELFIE_PROMPT, "rabble selfie")
    rabble = greenscreen.key(made)
    if rabble is None:
        raise ValueError("couldn't make your Rabble person from that photo")
    rabble.thumbnail((420, 420))
    return png_bytes(rabble)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=APP, **kw)

    def log_message(self, fmt, *args):
        # Paths only; request bodies (photos) are never logged.
        sys.stderr.write("rabble: " + (fmt % args) + "\n")

    def end_headers(self):
        # The people pictures never change, so browsers keep them (less bandwidth);
        # everything else is always fresh.
        cached = self.path.startswith("/people-web/")
        self.send_header("Cache-Control", "public, max-age=604800" if cached else "no-store")
        super().end_headers()

    def _visitor(self):
        if CLIENT_IP_HEADER:
            address = self.headers.get(CLIENT_IP_HEADER, "").strip()
            if address:
                return address[:64]
        return self.client_address[0]

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self, limit=4096):
        length = int(self.headers.get("Content-Length") or 0)
        if not 0 < length <= limit:
            raise OverflowError("that's a lot to send")
        data = json.loads(self.rfile.read(length) or b"{}")
        if not isinstance(data, dict):
            raise ValueError("expected an object")
        return data

    def _say(self):
        try:
            data = self._body()
            # Only people in the pile count against the budget.
            if room.is_player(data.get("token")) and not limits.allow("say", self._visitor()):
                return self._json(429, {"error": SLOW_DOWN})
            return self._json(200, room.say(data.get("token"), str(data.get("text", ""))))
        except OverflowError as e:
            return self._json(413, {"error": str(e)})
        except PermissionError as e:
            return self._json(403, {"error": str(e)})
        except TimeoutError as e:
            return self._json(503, {"error": str(e)})
        except ValueError as e:
            return self._json(422, {"error": str(e)})
        except Exception as e:  # API failure; no key material in the message
            sys.stderr.write(f"rabble: chat failed: {type(e).__name__}\n")
            return self._json(502, {"error": "the pile didn't catch that"})

    def _join(self):
        try:
            data = self._body()
            if not limits.allow("join", self._visitor()):
                return self._json(429, {"error": SLOW_DOWN})
            return self._json(200, room.join(data.get("figure")))
        except OverflowError as e:
            return self._json(409, {"error": str(e)})
        except ValueError as e:
            return self._json(422, {"error": str(e)})

    def _leave(self):
        try:
            room.leave(self._body().get("token"))
        except (OverflowError, ValueError):
            pass
        return self._json(200, {})

    def _events(self, query):
        q = parse_qs(query)
        try:
            since = int(q.get("since", ["-1"])[0])
        except ValueError:
            since = -1
        viewer = q.get("v", [""])[0][:40] or self.client_address[0]
        token = self.headers.get("X-Rabble-Token")
        return self._json(200, room.events(since, viewer, token))

    def _figure(self, fid):
        png = room.figure(fid)
        if not png:
            return self._json(404, {"error": "not here"})
        self.send_response(200)
        self.send_header("Content-Type", "image/png")
        self.send_header("Content-Length", str(len(png)))
        self.end_headers()
        self.wfile.write(png)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/api/events":
            return self._events(url.query)
        if url.path.startswith("/api/figure/"):
            return self._figure(url.path.rsplit("/", 1)[1])
        if url.path == "/api/whispers":
            return self._json(200, whispers.current())
        return super().do_GET()

    def do_POST(self):
        if self.path == "/api/say":
            return self._say()
        if self.path == "/api/join":
            return self._join()
        if self.path == "/api/leave":
            return self._leave()
        if self.path != "/api/selfie":
            return self._json(404, {"error": "not found"})
        length = int(self.headers.get("Content-Length") or 0)
        if not 0 < length <= MAX_BODY:
            return self._json(413, {"error": "photo too large"})
        try:
            photo = read_photo(self.rfile.read(length))
        except Exception:
            return self._json(422, {"error": "that doesn't look like a photo"})
        # Only real photos count against the budget.
        if not limits.allow("selfie", self._visitor()):
            return self._json(429, {"error": "that's a lot of photos, try again later"})
        if not SELFIES_AT_ONCE.acquire(timeout=60):
            return self._json(503, {"error": "lots of people are making theirs, try again in a moment"})
        try:
            out = selfie_to_rabble(photo)
        except ValueError as e:
            return self._json(422, {"error": str(e)})
        except Exception as e:  # API or decode failure; message has no key material
            sys.stderr.write(f"rabble: selfie failed: {type(e).__name__}\n")
            return self._json(502, {"error": "couldn't make your Rabble person right now"})
        finally:
            SELFIES_AT_ONCE.release()
        self._json(200, {"image": "data:image/png;base64," + base64.b64encode(out).decode(),
                         "figure": room.add_figure(out)})


if __name__ == "__main__":
    room.start()                                             # the shared pile's own talk
    print(f"Rabble on http://{HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
