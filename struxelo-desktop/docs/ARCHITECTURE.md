# Architecture and implementation notes

Concept and product direction: **Junaid Quamar, Senior Planning Engineer**.

## Boundaries

Struxelo's Windows package consists of Electron's main process, a sandboxed preload bridge and a bundled browser renderer. The renderer owns the in-memory project and requests only explicit file operations from the main process.

| File | Responsibility |
| --- | --- |
| `desktop/main.cjs` | Window lifecycle, native dialogs, size-limited file reads, temporary-file publication for saves |
| `desktop/preload.cjs` | Two narrow IPC methods: `openProject` and `saveFile` |
| `src/project.js` | Project validation, XML/CSV import, date arithmetic, metrics, assignment preview, FS calendar-day engine |
| `src/viewer.js` | Three.js scene, camera, GLB loading, selection, status appearance, bounding-box screening |
| `src/main.js` | UI state, task inspector, schedule, dialogs, commands, local recovery and interaction history |
| `src/style.css` | Desktop layout, responsive density, focus styles and brand tokens |
| `scripts/package-windows.mjs` | Pinned official Electron runtime acquisition, package assembly and ZIP output |

The application does not import REA into its runtime. REA was used externally for the research phase and remains independently runnable. This distinction avoids implying that the app can decompile or natively open unsupported SYNCHRO projects.

## Renderer lifecycle

`project` contains persistent data. `selectedTask`, `selectedPart`, focus date, current panel, playback state and filters are UI state. They are not part of the portable project schema.

Edits are made on a JSON clone. Validation runs before the new project is committed. A successful commit pushes the previous project into Undo history, clears Redo, updates the project, attempts local recovery and redraws the dependent panels. Opening a project or importing a schedule resets history and geometry state.

Three.js uses a persistent canvas and scene rather than reconstructing WebGL on each task change. Ordinary progress or assignment edits recolor existing meshes. Replacing geometry or applying a geometry-related Undo reloads the model. A generation counter prevents an older asynchronous load from becoming the current displayed model.

Mesh geometries, display materials and referenced textures are disposed when the old scene is cleared. Imported models receive standardized construction-status materials. Camera controls use damping and a ResizeObserver keeps the canvas aligned with its container. The renderer uses at most device pixel ratio 2 to limit high-DPI cost; large geometry can still consume substantial GPU memory.

## Dates, dependencies and calculations

Dates are integers representing UTC calendar days. Display formatting explicitly uses UTC. This avoids daylight-saving shifts in whole-day calculations; it also means intra-day schedule semantics are intentionally lost during import.

Dependency records retain FS, SS, FF and SF types. Validation checks missing endpoints, self-links and cycles. The recalculation engine accepts only flat FS networks. It performs a topological forward pass for earliest dates and a reverse pass for latest dates and total float. Activity duration is its current finish-minus-start date span, and predecessor lag is measured in calendar days.

The engine does not solve calendar exceptions, maximum lags, external relationships, resource leveling, imposed constraints or source scheduling options. Retained unresolved P6 links block the UI's recalculation command. Showing imported source critical flags does not establish a newly computed critical path.

Earned value is a prototype physical-percent calculation. Planned value is linear across baseline dates. Task summaries are excluded from totals. Zero denominators produce an unavailable ratio, not infinity. Detailed formulas are in the user guide.

## Geometry and assignments

Demonstration geometry consists of independently authored boxes. GLB import creates one resource per mesh, identified by stable traversal index (`mesh-0`, `mesh-1`, and so on). The entire embedded GLB is saved with the project; it is reparsed on reload in the same traversal order.

Assignments map one part to one task. This is simpler than SYNCHRO's full resource/appearance model. Automatic assignment only proposes unique code-substring matches, preserving existing assignments. An explicit preview precedes writes.

Overlap screening derives world-space axis-aligned bounds. It tests pairs of parts whose tasks are active on the focus date. It is O(n²), limited to 1,000 active parts, and may report false positives for rotated or concave geometry. It does not detect continuous-time collisions between frames.

## Persistence and desktop isolation

The renderer has no Node.js APIs. Electron enables `contextIsolation`, `sandbox` and `webSecurity`, disables `nodeIntegration`, denies new windows and blocks page navigation. A content security policy limits executable content to local assets and prevents arbitrary object embeds. The preload bridge exposes no generic file path or process execution API.

Native Open reads only the user-selected file and limits its size to 40 MB. Native Save accepts a limited set of export kinds and writes through a sibling temporary file before rename. This reduces partial-file exposure but is not a transaction history or a guarantee against filesystem faults. Local recovery uses localStorage and can fail due to quota or access restrictions.

GLB resource URL rewriting permits only `data:` and `blob:` embedded resources. External URI fetching is refused. DTDs and entity declarations are rejected before XML parsing. UI values are HTML-escaped before insertion. CSV export escapes potentially executable spreadsheet prefixes. These controls do not replace testing of malformed, very large or adversarial inputs.

## Build and distribution

Vite bundles the renderer into relative assets so Electron can open `dist/index.html` using `file:` URLs. The desktop shell uses only Electron and Node built-ins; runtime npm installation is unnecessary.

The Windows packaging script obtains Electron 45.0.0 using @electron/get's checksum verification, customizes its executable icon and product metadata, installs the built app under `resources/app`, and copies manuals and notices. It produces an unsigned portable ZIP. A native Windows build agent, signing identity, installer and update policy are future release work.

## Next architectural work

Before expanding to large commercial projects, separate command handlers from DOM rendering, move long parsing/geometry work into workers, replace full-snapshot history with bounded commands, and add a documented calendar-aware scheduling engine. Introduce versioned migrations before changing the saved schema. Source-application compatibility needs exact fixtures, comparison rules and an observed SYNCHRO baseline.
