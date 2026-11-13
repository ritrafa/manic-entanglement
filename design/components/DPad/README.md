# DPad

The touch controls: four direction keys in a cross, and the pause button on the board.

- **D-pad.** `me-dpad` holds four `me-btn` keys with `is-u`, `is-l`, `is-r`, `is-d`, each `dpad-key` (64px) with a `space-4` gap. The arrow is the CSS pixel arrow (`me-arrow`), never a text glyph. Each key has an `aria-label`.
- Keys are `maze-800`; a held key is `maze-500` with no lip. No centre key.
- Shown only when the touch-controls setting is D-pad, under the HudBar, centred.
- **Pause.** A 48px `me-btn-icon` with `me-pause-bars`, top right of the board, `space-8` in from both edges. Hide it while any panel is open.
- You provide nothing but the handlers. Do not resize the keys per device; do not make them translucent.
