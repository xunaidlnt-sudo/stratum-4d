# 4D gap analysis against the SYNCHRO 4D documents

Two documents were supplied for this review:

- **[DS]** the SYNCHRO 4D product data sheet (Bentley, 2 pages).
- **[TM]** "Comprehensive Synchro Pro 4D Hands-On Training Manual" (a third-party training deck, 26 slides).

Both describe what the product does and how a user works with it. Only that functional description was used, following [CLEAN_ROOM.md](CLEAN_ROOM.md). No SYNCHRO software, file format or artwork was used, and Stratum's names, layout and file format are its own.

Status: **Done**, **Partial**, **Planned** or **Not planned**.

## Workspace and navigation

| Feature | Source | Stratum | Notes |
|---|---|---|---|
| Task list, Gantt chart and 3D view in one window | TM 2–3 | **Done** | 4D layout |
| Resize, undock and re-dock windows; reset the layout | TM 4–5 | **Partial** | Resizable panes and pop-out display windows on other monitors (Displays). No free docking |
| Collapse / expand the WBS; Shift+←/→ | TM 6 | **Done** | Click the WBS row; Expand/Collapse in the P6 and Project layouts |
| 3D: rotate, pan, zoom with the mouse | TM 7 | **Done** | |
| Zoom All | TM 7 | **Done** | Toolbar of the 3D view |
| View cube (standard directions) | TM 7 | **Done** | View menu: isometric, top, front, back, left, right |
| Several 3D windows | TM 7 | **Partial** | The 3D view can open in a display window; one 3D camera |

## 4D review and linking

| Feature | Source | Stratum | Notes |
|---|---|---|---|
| Player: start, play, stop, step; speed in time per step | TM 8 | **Done** | Speed in days per second; step a day or a week |
| Import P6, MS Project XML schedules | TM 9 | **Done** | XER and MSPDI; also P6 EPPM and P6 database |
| Import Asta Powerproject, PMA NetPoint | TM 9 | **Not planned** | Need the vendors' own software |
| Import 3D models: IFC | TM 10–11 | **Done** | IFC2x3 / IFC4 with properties and storeys |
| Import other 3D formats (DWG, DGN, RVT, NWD, SKP, FBX, glTF, OBJ…) | TM 10 | **Planned** | glTF/GLB and OBJ next; proprietary CAD formats need the vendor libraries |
| Import options: units, user fields, skip hidden or wireframe objects | TM 11 | **Partial** | IFC properties become element properties; no import dialog |
| 3D resources and resource types (equipment, human, location, material) | TM 12–13 | **Partial** | Elements link directly to activities; named element groups; resources with types in the schedule. No resource wizard |
| Link elements to tasks: drag and drop, context menu, shortcut | TM 14 | **Done** | Link button, rules, auto-detect, and **Ctrl+Shift+A** (selected elements to the selected activity, with the profile last used). No drag and drop yet |
| Appearance profiles: Install, Maintain, Neutral, Remove, Temporary | TM 15 | **Done** | Colour and transparency before / during / after; growth; transparency fade |
| Planned versus actual (ahead / behind) | DS | **Done** | New colour mode: green ahead, blue on plan, red behind, from current against baseline progress at the playback date |
| Model-based quantities (QTO) | DS | **Done** | Quantities tab and quantity curves from IFC quantities |
| Equipment and paths | DS | **Done** | 3D paths for cranes and plant |

## Presentation and output

| Feature | Source | Stratum | Notes |
|---|---|---|---|
| Animation editor with keyframes: camera, focus time, 3D view properties | TM 16–17 | **Done** | Three channels; click a channel to add a key from the current view; drag keys; smooth / linear / jump camera movement; preview |
| Export animation: resolution, frame rate, split, codec | TM 18–20 | **Done** | WebM video or a PNG image series (zip), 720p to 4K, 15–60 fps. No split; WebM instead of AVI/H.264 |
| Legend and date in the exported video | TM 18 | **Done** | Options in the export dialog |
| Hide indicators (grid, axis, paths) for export | TM 18 | **Done** | Ground grid option; paths in the Display tab |
| 3D subdivision: Slice (uniform) | TM 21 | **Done** | Split an element into equal parts along X, Y or Z |
| 3D subdivision: User slice (uneven), grid of columns × rows × layers, freehand | TM 21 | **Planned** | Uneven cuts and grids next; freehand later |
| Cutting planes X / Y / Z and a cutting box | TM 22 | **Done** | Sections panel: any number of planes, flip, and a section box, also fitted to the selection |
| Viewpoints: focus time, camera, filters and cutting planes; activate | TM 23 | **Done** | Viewpoints panel: save, show, update, rename, delete |
| Save as image | TM 24 | **Done** | Viewpoint as a 1920 × 1080 PNG with name, date and legend; snapshot of the current view |
| Markup mode | TM 23 | **Planned** | |
| Export 3D PDF | TM 24 | **Not planned** | Proprietary PRC writer. A glTF export of the model at the playback date is the planned alternative |

## Collaboration (data sheet)

| Feature | Source | Stratum | Notes |
|---|---|---|---|
| Field status checks and inspections on web and mobile | DS | **Partial** | Web app and Android app; field forms planned |
| Cloud project sharing with roles | DS | **Done** | Stratum Server, cloud folders |
| Power BI connector (EVA and Gantt tabs) | DS | **Partial** | Dashboards with EVM and Gantt widgets; Excel and PowerPoint export. No Power BI connector |
| What-if scenarios | DS | **Partial** | Save as new project, compare with Claim Digger, simulate baseline or current dates |
