# Mockups

Source of the Design canvas for Series Zero. Each `.dc.html` is one artboard: plain HTML and CSS wrapped in `<x-dc>`, `<helmet>`, `<sc-if>` and `{{hole}}` tags. They do not render on their own (the canvas runtime is not included). Read them as markup and use `sz.css` as the shared stylesheet.

- Desktop artboards: 1440 wide. Phone artboards (`M-*`): 390 wide.
- `PitchRoom.dc.html` is the interactive one: its script holds a 5-beat state machine (`beat` 0 to 4).
- See `../DESIGN.md` section 1 for how to render them for Playwright comparison.
