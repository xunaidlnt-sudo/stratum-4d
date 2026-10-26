# Data formats and interoperability

## Struxelo project schema 1

A `.struxelo` file is UTF-8 JSON. It can also be opened with a `.json` extension. Core structure:

```json
{
  "schema": 1,
  "name": "Example project",
  "tasks": [{
    "id": "A100", "name": "Foundations", "wbs": "Civil", "code": "FOUND",
    "start": "2026-11-01", "finish": "2026-11-12",
    "progress": 25, "budget": 120000, "actualCost": 28000,
    "predecessors": [], "summary": false, "critical": false
  }],
  "parts": [{
    "id": "part-1", "name": "FOUND / Raft", "taskId": "A100",
    "position": [0, 0, 0], "size": [10, 0.5, 8]
  }],
  "baseline": {"A100": {"start": "2026-11-01", "finish": "2026-11-12"}},
  "modelAsset": null,
  "warnings": [],
  "unresolvedDependencies": []
}
```

`taskId: null` means unassigned. Each task and part needs a unique string ID. Progress is 0–100. Costs are finite, nonnegative numbers. Dates must be valid ISO calendar dates with finish on or after start. Dependency records are `{ "id": "A090", "type": "FS", "lag": 0 }`; they refer to predecessor task IDs.

`baseline` is optional/null or a task-ID-keyed map of date pairs. `modelAsset` is null for box geometry, or a base64 data URL containing the complete GLB. When GLB data exists, mesh traversal IDs define the connection to `parts`; the part boxes are bounds metadata, not decoded mesh replacements.

Prototype limits are 10,000 tasks, 20,000 parts, a 25 MB GLB, a 30 MB schedule input and a 40 MB desktop project read. These are admission limits, not performance guarantees. Imported GLB data expands in JSON and Undo snapshots.

## Microsoft Project XML subset

The importer recognizes the XML Project/Tasks structure, removing XML namespace prefixes while preserving field text. It skips the UID 0 project root and null task placeholders. It retains non-root summary rows.

| Source | Internal field |
| --- | --- |
| `UID`, `ID`, `Name`, `WBS` | `id`, `code`, `name`, `wbs` |
| `Start`, `Finish` | Whole-date `start`, `finish` |
| `PercentComplete` | `progress` |
| `Cost`, `ActualCost` | `budget`, `actualCost` |
| `Summary`, `Critical` | Source flags |
| `PredecessorLink` | Internal predecessor record |

Relationship type mapping follows MSP's numeric FF/FS/SF/SS representation. `LinkLag` uses an 8-hour-day approximation: source tenths of minutes divided by 4,800. Working calendars, source duration formats, constraints, resource assignments and elapsed-time variants are not evaluated. An imported `Cost` field is mapped for convenience; equivalence to contractual BAC is not established.

## Primavera P6 XML subset

The importer recognizes one `APIBusinessObjects/Project`. More than one project is rejected pending an explicit project-selection workflow. It reads activities, WBS rows and relationships.

Activity `ObjectId` is used to resolve links to the activity's external `Id`. Missing IDs are not guessed or stripped. Unsupported relationship types and missing endpoints are retained in `unresolvedDependencies`, with source endpoint IDs and lag hours. The import report gives their count. These records block recalculation.

Start/Finish use source `StartDate`/`FinishDate` when present, otherwise planned date fields. Only their date components are retained. Progress is imported from `PercentComplete`; the source percent-complete method is not reproduced. Resource assignment cost rollups, calendars, constraints, actual-date rules and P6 scheduling settings are outside the supported subset. Lag hours are divided by eight as an explicitly reported approximation.

The public P6 sample contains 95 activities and 158 relationships. Struxelo resolves 155 and preserves three unresolved records. The missing endpoint strings include `_8`, `_10` and `_11`; this is an observation of that sample, not a general P6 rule.

## CSV

Required headers: `id,name,start,finish`. Optional: `wbs,code,progress,budget,actualCost`. Quoted commas, quoted newlines and escaped double quotes are accepted. Dependencies are not imported from CSV. Empty optional numeric values become zero; date validation still applies.

CSV export contains the nine supported task columns. It is not a lossless project export. Text starting with spreadsheet formula characters is prefixed with an apostrophe. Use the native JSON project for complete supported state.

## GLB

The importer accepts binary glTF with embedded buffers and textures. External URLs are refused. Decoder-dependent compression, animated/skinned assets and original material fidelity are outside the supported workflow. The current renderer assigns uniform construction-status materials and treats model coordinates as given.

No native decoding of `.sp`, `.spx`, `.dwf`, `.dwfx`, `.rvt` or IFC is implemented. A ZIP-based DWFX container inventory does not establish geometry decoding. REA's rejection of an SP file does not imply that its data is corrupt; it means the selected REA operation does not support that format.
