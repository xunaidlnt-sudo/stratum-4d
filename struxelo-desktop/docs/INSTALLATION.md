# Installation and operation

Concept and product direction: **Junaid Quamar, Senior Planning Engineer**.

## Windows distribution

Target: Windows 10 or Windows 11, x64. A working Chromium-compatible graphics driver is needed for the 3D view. The desktop window has a minimum size of 1050 × 720; 1440 × 900 or larger is more comfortable.

The deliverable is a portable directory in a ZIP, not an installer. Extract all files, then start `Struxelo4D.exe`. Moving only the executable will break Electron's runtime dependencies. The runtime is based on the official Electron distribution. Its icon and product metadata are customized for Struxelo 4D; it is unsigned.

Project files can be saved to a location chosen through the native Save dialog. Automatic recovery uses Chromium local storage in the application's user-data profile. For Windows, Electron normally places that profile below `%APPDATA%\Struxelo 4D`. The app does not connect to a project server.

The bundled example is an independent demonstration, not Bentley's training building. Start with it before importing production information. Treat this release as a prototype until the Windows acceptance checklist and representative project checks have been completed.

## Local development

From the source directory:

```sh
npm ci
npm run dev -- --port 5173
```

Open `http://localhost:5173`. The development renderer uses browser file inputs and downloads; these differ from native Windows dialogs. Stop the development server with Ctrl+C.

Build production assets:

```sh
npm run build
```

Package Windows x64:

```sh
npm run package:windows
```

The packaging script requires Python 3, network access to Electron's official release distribution and enough free space for the extracted runtime and ZIP. In a proxy-based environment, keep the provided proxy and CA configuration; set `ELECTRON_GET_USE_PROXY=1` if @electron/get requires it. Do not disable certificate verification.

The resulting folder and ZIP are in `release/`. The script downloads a pinned runtime, verifies its published checksum, places the built application in `resources/app`, copies the manuals and keeps runtime licenses.

## REA installation

REA 6.8.0 was built from GitHub commit `0211a07ec5c43b2f8cbdbcd80f3f3619773a7b72` in `/workspace/rea`. The public launcher is:

```sh
/workspace/bin/rea --version
/workspace/bin/rea mcp doctor --json
```

Its pinned Node.js and npm are isolated under `/workspace/rea-toolchain`. No native decompiler was installed. REA's CLI works independently of agent registration; a successful adapter test does not mean REA tools have been injected into this already-running chat session.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| The app does not start after extraction | Confirm the complete runtime folder was extracted. Test on a Windows x64 machine. |
| 3D is unavailable | Update the graphics driver and verify hardware acceleration. Schedule editing can still be used. |
| Recovery cannot be saved | Save a project file. The local storage quota may be exhausted, especially with embedded GLB data. |
| A GLB fails | Use an uncompressed, self-contained binary glTF. External buffers/textures, skinned meshes and decoder-dependent assets are outside the supported subset. |
| P6/XML import reports omissions | Read the import report. Original dates are preserved; unresolved relationships are retained and block recalculation. |
| Task changes are rejected | Check ISO dates, negative costs, dependency IDs and circular links. No invalid edit is committed. |
