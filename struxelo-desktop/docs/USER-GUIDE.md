# User guide

**Struxelo 4D 0.1.0**  
Concept and product direction: **Junaid Quamar, Senior Planning Engineer**.

## Workspace

The left rail selects Plan, Model, Costs and Evidence. The project explorer contains a three-step workflow and searchable model resources. The main workspace holds summary metrics, the 3D viewport, a task inspector, playback controls and a schedule or information panel.

Plan and Model currently share the same model-and-schedule workspace; Model does not expose a separate geometry authoring suite. Costs changes the lower panel to a cost table. Evidence explains what was observed and what remains unsupported. Guide provides an in-app introduction; About displays project credits.

The opening Northbank project has ten activities and a simple independently generated building. It is demonstration data, not a calibrated construction plan. Select a task row to inspect it. Select a model part in the explorer or viewport to highlight it; clicking a linked part in the viewport also selects its assigned task.

## Bring in a schedule

1. Save the current workspace if needed.
2. Choose **Import your schedule**.
3. Select a P6 XML, Microsoft Project XML or supported CSV.
4. Confirm replacing the current project. Schedule imports clear existing geometry and Undo history.
5. Read the import report. It describes fields that were not interpreted and any retained unresolved relationships.

Dates are imported as whole dates. The program does not immediately recalculate them. Summary rows are preserved for MSP imports; P6 activities carry their WBS identifier or code. This prototype does not evaluate working calendars, constraints or source scheduling rules.

For CSV, provide `id`, `name`, `start`, and `finish` headers. Optional headers include `wbs`, `code`, `progress`, `budget` and `actualCost`. Use `YYYY-MM-DD` dates and numeric values without currency symbols. Quote names containing commas.

```csv
id,name,wbs,code,start,finish,progress,budget,actualCost
A100,Foundations,Civil,FOUND,2026-11-01,2026-11-12,25,120000,28000
A110,Steel frame,Structure,STEEL,2026-11-12,2026-11-26,0,200000,0
```

## Add and link a model

Choose **Add a 3D model** and select a self-contained `.glb` file up to 25 MB. Importing replaces the current geometry and its assignments, while retaining schedule tasks. The prototype uses the model's native coordinate units; it does not infer a CAD unit system.

GLB animations, skinning, compressed geometry extensions and external resources are not supported workflows. Imported parts use standardized display materials so that construction status is legible. Original material fidelity is not preserved.

To assign manually:

1. Select a model resource in the explorer or viewport.
2. Select its intended task in the schedule.
3. In Task properties, scroll to **Linked model parts**.
4. Click **Link selected part**. Unlink removes that assignment.

Each part has one task assignment in this prototype. Many parts may reference the same task. The resource-to-task graph does not reproduce SYNCHRO's complete resource hierarchy or many-to-many appearance semantics.

Automatic assignment uses a task's **Matching code**. A code of at least three characters must appear in a part name, ignoring case. Only unassigned parts with exactly one matching task are proposed. Review the preview before applying. Ambiguous matches remain unassigned.

## Review construction

- Drag the timeline to choose the focus date.
- Use previous/next to step exactly one calendar day.
- Use beginning/end to jump to the project bounds.
- Choose a playback rate of 1, 7 or 30 days per second, then Play.
- Planned mode derives status from task dates. Actual progress mode uses recorded task percentages and is not a historical status reconstruction.
- Hide upcoming removes future parts in Planned mode and zero-progress parts in Actual progress mode.
- Orbit by dragging; zoom with the mouse wheel. The toolbar provides isometric, top, front and fit views.

Colors identify complete, active and upcoming parts; blue indicates selection. A milestone changes state on its date. A zero-duration task has no active interval between dates.

**Screen active overlaps** compares world-space axis-aligned mesh bounding boxes at one focus date. Positive overlaps are candidates for review, not exact solid intersections or certified clash results. Touching faces are excluded by a small numerical tolerance. Screen at most 1,000 active parts at once.

Use **Export PNG** for a viewport image. It contains the rendered scene, not a full report with DOM labels or the schedule. Video export is not implemented.

## Edit activities and record progress

Select a task. Edit its name, WBS, matching code, dates, physical progress, budget or actual cost, then **Apply task changes**. Invalid dates, negative costs, progress outside 0–100, missing dependency IDs and dependency cycles are rejected.

Dependencies use comma-separated `ID:TYPE:lag` entries, for example `A100:FS:0, A105:FF:2`. Lag is in calendar days in the internal project. FS, SS, FF and SF links can be stored, but only FS links can be recalculated by the limited prototype engine.

**Recalculate FS plan** is explicit and requires confirmation. It supports flat tasks, calendar days, fixed current date-span durations and FS dependencies. The earliest task date becomes the origin. It does not preserve independently imposed task start constraints. Summary rows, other link types or retained unresolved import relationships block recalculation.

**Capture baseline** stores the current start/finish dates and replaces the prior baseline. Gray lines appear beneath current Gantt bars. Capture can be undone. The baseline is a date snapshot, not a complete historical schedule or a separate cost budget.

## Costs

Values are expressed as USD; currency selection is not implemented. Summary rows are excluded to prevent double counting.

- Budget at completion: sum of leaf-task budgets.
- Earned value: sum of each leaf-task budget × entered physical progress / 100.
- Actual cost: sum of entered leaf-task actual costs.
- Planned value: budget spread linearly across baseline dates, or current dates when no baseline exists, evaluated at the focus date.
- CPI: earned / actual cost, or unavailable when actual cost is zero.
- Cost variance: earned minus actual cost.

Planned value is a simplified linear approximation. These calculations do not reproduce resource curves, contractual valuation rules or all P6/MSP earned-value settings. Headline progress is the unweighted mean of leaf-task percentages, not a budget- or quantity-weighted project percentage.

## Saving, recovery and sharing

**Save project** writes a `.struxelo` JSON file. Embedded GLB data, assignments, task values, baseline dates, warnings and unresolved relationship records travel with it. **Open project** validates before opening and asks before replacing the workspace.

Committed edits also attempt a local recovery copy. Recovery storage has a quota; a large embedded model may exceed it. The status changes and an error message instructs you to save a file. A successful recovery write is not proof that you saved a portable project copy.

Undo/Redo retain up to 40 full project snapshots in memory. Opening or importing a schedule clears that history. Large embedded models increase memory use. Task deletion removes its incoming/outgoing links and unassigns affected model parts; Undo can restore them.

**Export schedule** creates a CSV of selected task fields. Dependencies, geometry, baselines and import provenance are not included; use `.struxelo` for a complete supported project. Spreadsheet formula prefixes are escaped in CSV text cells.

Keyboard shortcuts outside text fields: Ctrl+Z Undo, Ctrl+Y or Ctrl+Shift+Z Redo, Ctrl+S Save, and Space Play/Pause. The in-app guide and property labels remain available without a network connection.
