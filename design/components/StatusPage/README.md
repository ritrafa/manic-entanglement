# StatusPage

The full-page pattern for 404 and the crash page: a strip of maze sprites, a headline, one line, one button.

- **You provide** the headline, one sentence, the button and, for a crash, the reference code.
- **Structure.** `me-statuspage` centred on `void`: three 48px sprites in a row (two wall tiles and the exit for 404; an enemy between walls for a crash), then the text, then one primary button.
- **404.** "404" in `display-xl` `gold`, "No corridor here" in `display-lg`, "That page is not in this maze.", button "Back to the title".
- **Crash.** "The maze tangled itself" in `display-lg`, "Something went wrong while the game was running.", "Reference: <code>" with the code in `energy`, button "Try again".
- The stylesheet and both fonts must load on these routes; today the 404 renders unstyled.
- One button only. No stack traces, no apology paragraph, no illustration beyond the sprite strip.
