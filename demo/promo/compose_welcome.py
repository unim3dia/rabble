"""Cut the welcome promo (vertical, about 100 seconds): the current Rabble on a
phone, from your photo to being caught, "What's on your mind?", your own words,
and the pile answering with its bodies, with cards between that welcome and
explain. Uses compose.py's cutter on the record_welcome.mjs take.
Writes demo/promo/out/rabble-welcome.mp4.

  python demo/promo/compose_welcome.py   (after record_welcome.mjs and the w- cards)
"""
import compose

compose.TAKE = "frames-welcome"
compose.NAME = "rabble-welcome"
compose.SHOTS = [
    ("w-title", "ready", 0.0, [(3.8, 1.0)]),
    ("take", "menu", 0.5, [(10.5, 1.5)]),                                   # the pile from afar; people fall in
    ("w-you", "ready", 0.0, [(3.9, 1.0)]),
    ("take", "making", 0.2, [("made", 11.0), (3.2, 1.0)]),                 # making you → here you are
    ("w-caught", "ready", 0.0, [(3.9, 1.0)]),
    ("take", "join", 0.6, [(7.4, 1.0)]),                                    # drop in; "There you are"; You
    ("w-mind", "ready", 0.0, [(4.3, 1.0)]),
    ("take", "asked", -0.3, [("sent", 1.4), ("yours", 1.2), (1.6, 1.0)]),   # the question; Answer; your words
    ("w-bodies", "ready", 0.0, [(4.3, 1.0)]),
    ("take", "reply", -0.8, [(8.0, 1.0)]),                                  # a reply, a squeeze, a cheer
    ("w-rest", "ready", 0.0, [(3.9, 1.0)]),
    ("take", "light", -0.2, [("sent2", 1.8), ("reply2", 2.0), (5.5, 1.0)]),  # "long week"; the pile leans in
    ("take", "close", 0.5, [(10.0, 1.5)]),                                  # in among the sleeping faces
    ("w-meta", "ready", 0.0, [(4.4, 1.0)]),
    ("take", "ring", 2.7, [("tower", 1.8), (8.5, 1.4)]),                   # the world falls in; slowly round
    ("w-end", "ready", 0.0, [(4.8, 1.0)]),
]

if __name__ == "__main__":
    compose.main()
