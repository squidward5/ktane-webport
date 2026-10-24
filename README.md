# ktane-webport

my third web port. game was decompiled with assetripper premium and i manually fixed all known bugs during play-testing.

# play here: https://squidward5.github.io/ktane-webport

# update 1.0.2 (latest):
fixed minigames that didn't match up with the bomb defusal manual

# Local use

`index.html` is the local launcher; keep `data/` and `Build/` beside it and serve the folder over HTTP. For example, run `python -m http.server 8000` from this directory and open `http://localhost:8000/`. Opening the local launcher directly as a `file://` URL is blocked by browser fetch restrictions.

`singlefile.html` is self-contained and loads its pinned Unity build, data chunks, manual, and watermark from CDNs. It does not need the local `data/` or `Build/` folders.

# update 1.0.1:
fixed an audio bug where when you would spam click to load into the game an audio buffer error would appear
