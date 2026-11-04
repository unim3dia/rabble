// The shared pile: everyone who opens Rabble is in the same pile. This keeps
// a long-poll open to the server and passes along what happens: real people
// arriving and leaving, what they say, and the pile's own conversation.

const RETRY_MS = 3000;

function viewerId() {
  try {
    let id = sessionStorage.getItem("rabble-viewer");
    if (!id) sessionStorage.setItem("rabble-viewer", (id = crypto.randomUUID().slice(0, 18)));
    return id;
  } catch {
    return Math.random().toString(36).slice(2, 14);
  }
}

export function connectPile({ onSnapshot, onArrive, onLeave, onSay, onChat }) {
  const viewer = viewerId();
  let seq = -1;
  let me = null;          // { id, token } once you've joined
  let figure = null;      // your selfie figure, if you made one
  let wantIn = false;

  const post = (path, body) => fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  async function join(fig) {
    figure = fig || null;
    wantIn = true;
    const res = await post("api/join", { figure });
    const out = await res.json().catch(() => ({}));
    if (res.status === 404) throw new Error("the server is out of date: restart it");
    if (!res.ok) throw new Error(out.error || "couldn't join the pile");
    me = out;
    return me;
  }

  function leave() {
    wantIn = false;
    if (!me) return;
    const body = new Blob([JSON.stringify({ token: me.token })], { type: "application/json" });
    if (!navigator.sendBeacon?.("api/leave", body)) post("api/leave", { token: me.token }).catch(() => {});
    me = null;
  }

  // If the server has forgotten you (it restarted, or your phone slept),
  // quietly join again and try once more.
  async function say(text) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!me) await join(figure);
      let res;
      try {
        res = await post("api/say", { text, token: me.token });
      } catch {
        throw new Error("couldn't reach the pile");
      }
      const out = await res.json().catch(() => ({}));
      if (res.ok) return out;
      if (res.status !== 403) throw new Error(out.error || "the pile didn't catch that");
      me = null;
    }
    throw new Error("couldn't find you in the pile, try again");
  }

  function handle(e) {
    const mine = me && e.id === me.id;
    if (e.type === "arrive" && e.player.id !== me?.id) onArrive(e.player);
    else if (e.type === "leave") {
      // Your phone went quiet for a while and the pile let you go: hop back in.
      if (mine && wantIn) { me = null; join(figure).catch(() => {}); } else if (!mine) onLeave(e.id);
    } else if (e.type === "say" && !mine) onSay(e);
    else if (e.type === "chat") onChat(e);
  }

  async function loop() {
    for (;;) {
      try {
        const headers = me ? { "X-Rabble-Token": me.token } : {};
        const res = await fetch(`api/events?since=${seq}&v=${viewer}`, { headers });
        if (!res.ok) throw new Error(`events ${res.status}`);
        const data = await res.json();
        if (data.players) onSnapshot(data.players.filter((p) => p.id !== me?.id));
        for (const e of data.events || []) handle(e);
        seq = data.seq;
      } catch {
        await new Promise((r) => setTimeout(r, RETRY_MS));
      }
    }
  }
  loop();
  window.addEventListener("pagehide", leave);

  return { join, leave, say, get id() { return me?.id; } };
}
