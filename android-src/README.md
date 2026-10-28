Java sources copied into the generated Android project by the `android` job in
`.github/workflows/desktop.yml` (after `npx cap add android`):

- `MainActivity.java` replaces Capacitor's default activity to register Stratum's plugins.
- `PrintPlugin.java` (`StratumPrint.print`) prints the page through Android's print service.
