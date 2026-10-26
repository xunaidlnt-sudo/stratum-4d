# Third-party notices

Struxelo 4D uses the following components. Attribution here does not replace their full license texts.

| Component | Use | License / reference |
| --- | --- | --- |
| Electron 45.0.0 | Windows shell and Chromium runtime | MIT; https://github.com/electron/electron |
| Three.js 0.186.1 | 3D rendering, GLB import and orbit navigation | MIT; https://github.com/mrdoob/three.js |
| fast-xml-parser 5.5.8 | Schedule XML parser | MIT; https://github.com/NaturalIntelligence/fast-xml-parser |
| Vite 8.3.5 | Development server and build tooling | MIT; https://github.com/vitejs/vite |
| @electron/get 3.1.0 | Build-time runtime acquisition and checksum verification | MIT; https://github.com/electron/get |

The Windows ZIP retains Electron's `LICENSE` and `LICENSES.chromium.html`. Renderer dependency license texts are copied into the distribution's `third-party-licenses` directory. `package-lock.json` records exact installed dependency versions and integrity hashes for source builds.

REA is separately installed tooling; its source and MIT license remain in the REA checkout. It is not bundled into the Windows application. Public Bentley materials are stored in the research workspace and are not redistributed as part of the application. Struxelo is not affiliated with or endorsed by Bentley Systems. No blanket license is granted here for third-party reference material or the supplied logo.
