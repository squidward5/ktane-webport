# ktane-webport

my third web port. game was pretty easy to port since it was in unity mono lol

# play here: https://squidward5.github.io/ktane-webport

The Unity WebGL data archive is stored as `data/data-000.bin` through
`data/data-015.bin`. `index.html` fetches chunks from this repository's `data/`
folder; `singlefile.html` fetches them from the eight `ktane-webport-data-*`
repositories on jsDelivr. Both pages assemble the chunks at runtime.
