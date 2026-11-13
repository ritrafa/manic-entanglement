# Settings

Form controls for the settings and controls panels: slider, checkbox, radio group.

- **You provide** a visible label for every control and the current value.
- **Row.** `me-field` is a label wrapping the control and its text, 32px tall at least. A slider row is label, `me-range`, then the value in `display-sm` (`me-value`).
- **Slider.** `me-range`: a `well` track with a `line` border and a `gold` thumb.
- **Checkbox and radio.** `me-check` and `me-radio`: 24px squares on `well`; on shows a `gold` centre. Radios are always inside a `me-fieldset` with a `label` legend, which is what tells them apart from checkboxes.
- **Actions.** Back is the primary; Reset progress is `me-btn-danger` and asks once before it acts.
- Native controls restyled, not rebuilt: keyboard and screen-reader behaviour stay.
- No toggles, no dropdowns, no browser accent colour.
