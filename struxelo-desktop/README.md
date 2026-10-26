# Struxelo 4D

**Concept and product direction: Junaid Quamar, Senior Planning Engineer.**

Struxelo 4D is an independent Windows desktop prototype for connecting construction activities to 3D model parts. It includes schedule editing, construction playback, baseline dates, physical progress and cost metrics. The renderer can also run locally in a browser for development and testing.

**Version 0.1.0 is not a complete or verified replacement for SYNCHRO 4D.** The current implementation was informed by public documentation, public user feedback and static inspection of Bentley's public training archive using REA. A running SYNCHRO installation was not available for differential testing. Native SP compatibility is not implemented.

[Download/read the illustrated handbook](docs/Struxelo-4D-Handbook.pdf) · [Standalone HTML handbook](docs/Struxelo-4D-Handbook.html)

## Start on Windows

1. Extract the entire `Struxelo-4D-0.1.0-win-x64.zip` archive into a writable local folder.
2. Run `Struxelo4D.exe` inside that folder. Keep its accompanying files and directories together.
3. Use the demonstration project to explore selection, timeline playback, task editing and costs.
4. Save a `.struxelo` project file before replacing the demo with your own data.

The package is unsigned. Windows execution, native file dialogs and GPU behavior require validation on an actual Windows machine. See [installation](docs/INSTALLATION.md).

## Documentation

| Document | Purpose |
| --- | --- |
| [User guide](docs/USER-GUIDE.md) | End-to-end planning workflow, imports, playback, assignments and recovery |
| [Architecture](docs/ARCHITECTURE.md) | Electron boundaries, renderer, model lifecycle and scheduling semantics |
| [Data formats](docs/DATA-FORMATS.md) | Project schema, supported XML/CSV fields and import limitations |
| [Research and sources](docs/RESEARCH.md) | Official sources, REA observations, download access and uncertainty |
| [Feature matrix](docs/FEATURE-MATRIX.md) | Implemented, partial and missing capabilities |
| [Review decisions](docs/REVIEW-DECISIONS.md) | Which public suggestions were adopted and why |
| [Validation](docs/VALIDATION.md) | Executed checks and Windows acceptance checklist |
| [Credits](CREDITS.md) | Product direction, software assistance and third-party attribution |

## Develop from source

Use Node.js 22.12+ or a supported current Node.js 24 release, npm and Python 3. The Windows package includes Electron and does not require users to install Node.js.

```sh
npm ci
npm run dev
# In another terminal, restore the public reference fixtures before tests:
npm run fixtures:download
npm test
npm run package:windows
```

The two real XML fixture tests require the official training archive in `research/samples`; see the research document for the source and digest. The packaging script uses Python's standard ZIP support and downloads the pinned Electron Windows x64 runtime. It does not modify system Node.js or install analysis engines.

## Main limitations

- Whole-date scheduling; no working calendars, constraint solver or resource leveling.
- P6 and MSP imports preserve selected fields; they do not reproduce source-application scheduling semantics.
- GLB models only. No direct IFC, RVT, DWF/DWFX or SP/SPX geometry decoder.
- Local single-user workspace. No Bentley cloud integration or multi-user synchronization.
- Approximate bounding-box screening, not exact solid clash detection.
- No Iray renderer, video export, equipment path editor or construction subdivision.

Third-party components retain their licenses. This project is independent of Bentley Systems. See [third-party notices](THIRD_PARTY_NOTICES.md).
