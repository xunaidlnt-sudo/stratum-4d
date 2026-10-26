# Validation and release acceptance

## Executed checks

The development environment is Linux. Passing renderer tests does not establish successful execution of the Windows shell.

| Check | Result / evidence |
| --- | --- |
| REA source build | Passed; 6.8.0 from recorded GitHub commit |
| REA stdio adapter | Passed; 229 tools, six prompts, matching identity and `binary_session` request |
| Public training ZIP inspection | Passed; REA inventory and SHA-256 retained |
| SP inspection | Unsupported target, recorded as a limitation |
| Schedule/data unit tests | 11 passed after fixing import handling and correcting the metric fixture's baseline |
| Browser interaction test | Passed 13 workflow checks; `research/ui-validation.json` |
| Model/file interaction test | Passed six checks; `research/model-validation.json`: GLB, assignment, embedded project save/reload, PNG and reopen |
| UI screenshots | `research/screenshots/` records large and compact desktop renderer layouts |
| Production renderer build | Vite build exercised; packaged assets generated locally |
| Windows runtime packaging | Built x64 portable ZIP; parsed executable verifies Struxelo name, credit, version and six icon sizes. Native execution remains untested |

## Unit-test scope

The suite covers JSON round-trip validation, strict date handling, branching FS critical-path/float calculation, cycle refusal, unsupported recalculation refusal, dangling assignments, negative costs, duplicate IDs, ambiguous matching, physical-percent earned value, summary exclusion, quoted CSV and spreadsheet-prefix escaping, malformed/DTD XML, multi-project refusal and both official XML samples.

The P6 fixture checks 95 activities, 155 resolved relationships and three retained unresolved links. MSP checks 118 non-root task rows. These checks validate the implemented subset; they do not compare with results from a running source application.

## Renderer test scope

`tests/ui-smoke.mjs` runs Chromium against the local dev server. It checks branding, WebGL startup, task editing, Undo/Redo, focus-date stepping, playback, searching, assignment previews, the Costs panel, credit display, compact layout, real XML imports, unresolved-link recalculation refusal, reload recovery and invalid-project refusal. It captures console errors and writes the result to a JSON report.

Run with `CHROMIUM_PATH` if Chromium is elsewhere, and `STRUXELO_URL` if the dev server uses another address. The tests use temporary browser profiles; they do not open the user's real project profile.

## Required Windows acceptance

- [ ] Extract the complete ZIP on Windows 10/11 x64.
- [ ] Start the executable and verify renderer, logo, window controls and task selection.
- [ ] Open and save through native dialogs, including cancellation.
- [ ] Save over an existing file; reopen and compare supported state.
- [ ] Test paths with spaces, Unicode names and non-writable destinations.
- [ ] Import both official XML examples and inspect warnings.
- [ ] Import a supported self-contained GLB; save/reopen and verify assignments.
- [ ] Test GPU behavior on representative workstations.
- [ ] Confirm recovery after ordinary close and unexpected termination.
- [ ] Check keyboard-only navigation, 125%/150% scaling and high-contrast needs.
- [ ] Verify package hashes and third-party license presence.
- [ ] Review unsigned executable behavior and decide on a signing/installer policy.

## Required semantic comparisons

Before claiming SYNCHRO parity, choose an exact executable version and compare deterministic fixtures for calendars, FS/SS/FF/SF logic, lags, constraints, milestones, status dates, actual dates, floats, resource loading, costs, model identifiers, appearance profiles and exports. Record missing coverage instead of converting it to a pass.

## Known release risks

The prototype uses full-project Undo snapshots and localStorage recovery, which are expensive for large embedded models. The UI is synchronous for some large data operations. Scheduling deliberately omits working calendars and source scheduling options. The Windows package is unsigned and not yet validated on Windows. These are explicit release limits, not hidden equivalence assumptions.
