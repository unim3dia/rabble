# Rabble

**A living pile of little clay people, awake together.**

Play it: **https://unim3dia.github.io/rabble/**

Drop into the pile, turn it, zoom all the way in, and tap someone so they bop.
Widen the ring from neighborhood to city to state to world, and more people fall
from the sky and land on the tower. The pile talks about real things happening
today, and when you say something, the people next to you answer.

Built for the Meta Global AI Developer Hackathon, 2026.

## What Meta AI does

| Model | What it does in Rabble |
|---|---|
| **Muse Image** | Drew every character (47 people, ages 10 to 90, up to seven poses each), and turns your photo into your own clay person. |
| **SAM 3.1** | Cuts every figure out of its background, and cuts you out of your photo before and after you're remade. |
| **Muse Spark** | Searches the web for today's real news and writes the pile's tiny conversations (one smart line, one funny, one a little perturbed); rewords what you say, kindly, and answers you; checked all the pictures for extra arms. |

## Two ways to run it

**The page** (GitHub Pages, no server): the pile, the rings, zooming and
bopping all work. Its talk is a night of conversations Muse Spark wrote ahead of
time (`app/offline.json`, made by `tools/make_offline.py`), and making your own
clay person is turned off.

**The full version** (your photo, live AI replies, one shared pile for
everyone on the link) runs on the small Python server:

```bash
pip install -r requirements.txt
echo "META_API_KEY=..." > .rabble-env      # gitignored; the key stays on the server
python tools/server.py                       # http://127.0.0.1:8130
```

## Layout

- `app/`: the web app (plain ES modules, canvas, no build step). `js/physics3d.js` is the pile's physics, `js/render.js` draws it, `js/main.js` runs it.
- `tools/server.py`, `tools/room.py`: the server and the shared pile (long-poll events: arrive, leave, say, chat).
- `tools/chat.py`: Muse Spark's conversations and replies. `tools/make_person.py`, `tools/build_people.py`: making the characters.
- `site/`: the landing page. `.github/workflows/pages.yml` publishes it with the app at `/play/`.
- `demo/promo/`: how the promo video was recorded and cut.

Your photo is never saved: it's handled in memory only, and your clay figure is
forgotten when you leave the pile.
