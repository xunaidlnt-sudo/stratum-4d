# Public feedback and product decisions

Product direction: **Junaid Quamar, Senior Planning Engineer**.

## Source quality

Feedback was read from direct review pages and an indexed vendor idea. Review dates, incentives, product identity and context matter. Older complaints do not establish current defects, and contradictory experiences should not be flattened into a single verdict.

The [Capterra SYNCHRO reviews](https://www.capterra.com/p/35289/Synchro/reviews/) include a 2018 account of feature overload, a 2022 comment on model-transfer materials/equipment movement and a 2025 concern about cost for smaller companies. These are qualitative observations, not representative statistics.

The [G2 SYNCHRO Construction reviews](https://www.g2.com/products/synchro-construction/reviews) include comments from 2019–2020 about interface discoverability, resource-tree learning and schedule synchronization setup. Some were incentivized. One review discusses traffic-signal modeling, which appears to concern a different SYNCHRO product; it was excluded from construction-planning decisions.

An indexed vendor idea requests [more playback controls](https://construction.ideas.aha.io/ideas/SYNREV-I-1). Opening the original page returned 404 during research. Its indexed description is a weaker signal than a readable full discussion; it is not treated as evidence of current behavior.

## Decisions

| Signal | Assessment | Implemented response | Validation |
| --- | --- | --- | --- |
| Features can be hard to discover | Logical for a dense planning interface | Visible three-step workflow, Guide and contextual task inspector | Renderer workflow test; user acceptance still needed |
| Resource relationships can be difficult to understand | Logical for model/schedule linking | Searchable parts, explicit assignment count, selected-part linking, unique-match preview | Manual linking and preview smoke checks |
| Playback precision is useful | Logical for reviewing a construction sequence | One-day stepping, date scrubber, start/end controls and selectable rates | Playback/step smoke checks |
| Synchronization setup is difficult | Useful interoperability concern | Preserve imported dates and display omissions; retain unresolved IDs | Real P6/MSP fixtures and refusal checks |
| Material-transfer and equipment-motion fidelity matter | Valid but requires format/runtime evidence | Recorded as a gap; no claim of solving it through GLB status coloring | Not implemented |
| Cost is a barrier | Product consideration, not a code bug | No invented pricing model or licensing claims | No pricing decision made |

Local recovery, Undo/Redo and explicit import confirmation were added as original usability decisions. They are not attributed to a review that did not request them.

## UX principles used

Give the model and schedule most of the screen. Keep properties next to selection. Use color consistently for progress and a different color for selection. Place destructive or replacing actions behind concrete previews. Keep calculation assumptions visible at the decision point. Use readable labels and keyboard focus states. Treat recovery as fallible and give users a portable save option.

## Next usability study

Ask planners to import a schedule, link five components, identify an unassigned component, review a date, record progress, compare baseline dates and save/reopen the project. Measure task completion, mistaken assignments and points where users seek help. Test both 1100 × 800 and larger desktop layouts. Validate with actual planning engineers before calling the interface production-ready.
