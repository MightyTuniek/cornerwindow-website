# CornerWindow website

Static site for [CornerWindow](https://github.com/MightyTuniek/cornerwindow), served by GitHub Pages.

The page has a working island in its top-right corner: click it, scroll on it, or type in its command bar.

- `index.html`: the page and the panel markup
- `css/site.css`: page styles, then the island (mirrors the app's `style.css`)
- `js/main.js`: springs and outline (ported from `core/anim.py` and `ui/shape.py`) and the panel's behaviour

Run locally with `python3 -m http.server` and open http://localhost:8000.
