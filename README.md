# CornerWindow website

Static site for [CornerWindow](https://github.com/MightyTuniek/cornerwindow), served by GitHub Pages.

The page draws the island's outline (shape only, no replica of the panel UI), so it doesn't drift from the app.

- `index.html`: the page and the panel markup
- `css/site.css`: page styles, then edge islands, hero outline, glass lens
- `js/main.js`: springs and outline (ported from `core/anim.py` and `ui/shape.py`) for the hero morph and the spring lab

Run locally with `python3 -m http.server` and open http://localhost:8000.
