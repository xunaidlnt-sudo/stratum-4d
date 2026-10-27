# Stratum 4D by Miqyas Labs: brand assets

**Stratum 4D** is a product of **Miqyas Labs** (*Engineering Intelligence*). Tagline: **PLAN | SIMULATE | ANALYSE | DELIVER**.

## Files

| File | Use |
| --- | --- |
| `stratum-lockup.png` / `-dark` / `-mono` | Full logo with "by Miqyas Labs" and the tagline: covers, splash, setup, help |
| `stratum-logo.png` / `-dark` | Compact logo (mark + Stratum 4D): title bars, report headers |
| `stratum-icon.svg` / `.png` (+ `-light`, `-dark`) | App icon, favicon (`public/favicon.svg`) and desktop icon (`build/icon.png`) |
| `stratum-mark.svg` | The mark alone |
| `miqyas-labs.png` / `-dark`, `miqyas-mark.svg` | Miqyas Labs logo for credits |

`-dark` versions are for dark backgrounds. All PNGs have transparent backgrounds. The files are generated from vector marks in `src/marks.cjs` with real Montserrat by `node brand/src/render.cjs` followed by `python3 brand/src/trim.py`; edit the marks there and re-run rather than editing PNGs.

## Colour

| Name | Hex | Role |
| --- | --- | --- |
| Deep Navy | `#0B2545` | Trust, technology, depth. Text, dark chrome, report rules |
| Warm Gold | `#D4A574` | Precision, engineering value. Highlights, secondary bars |
| Steel Blue | `#355B7D` | Innovation, analytics. Interface accent (light theme) |
| Light Stone | `#EBECEF` | Clarity, balance. Backgrounds and panels |
| Stratum Red | `#E10600` | Progress, milestones, action. The progress line, 4D-layout accent |

In the app these are CSS tokens (`--brand-navy`, `--brand-gold`, `--brand-steel`, `--brand-stone`, `--brand-red`). Chart series keep their own validated palette so that red never stands for a data series.

## Type

**Montserrat** (bundled as `@fontsource-variable/montserrat`) for the logo, headings, figures and report headers (`--font-display`). Interface text and dense schedule tables stay on the narrower Inter-based *Stratum Sans* by default; Montserrat can be chosen for the whole interface in Preferences.

## Credit line

"Stratum 4D by Miqyas Labs · developed by Junaid Quamar". Contact details are not published in this repository.
