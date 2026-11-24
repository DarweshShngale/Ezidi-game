# Verification · التحقق

`npm run typecheck` validates the production TypeScript. `npm run build` generates the self-hosted game and a content-versioned offline cache. GitHub's per-commit results are linked from the [workflow history](https://github.com/DarweshShngale/Ezidi-game/actions/workflows/pages.yml).

| Browser scenario | What it exercises |
|---|---|
| Desktop Chromium | Arabic RTL menu, chapter overview, graphics settings, actual keyboard movement and interaction, objective advancement, pause, IndexedDB checkpoint, reload and offline re-entry into WebGL play |
| Chromium mobile emulation | Landscape layout, simultaneous touch identifiers for movement and camera, interaction, jump, crouch, pause, settings and mirrored controls |
| Campaign traversal | Walk to and interact with 21 targets, follow all transitions, handle civilians and companion arrival, trigger the defensive encounter, reach the final reunion and reopen the unlocked last chapter |

The screenshots in this directory come from the running game. The title uses original cinematic art and the other two screenshots are live WebGL frames. The original actor files passed Khronos glTF validation. The procedural audio engine was separately exercised through running, suspended and resumed AudioContext states. The browser tests listen for JavaScript exceptions. Offline playback was verified by disconnecting the browser context after the first download.

The browser tests use real Chromium with software WebGL in CI. Mobile tests emulate a touch screen. They do not measure representative hardware frame rates, physical haptic feedback, device-specific audio quality or an actual iOS home-screen installation. Physical Galaxy, iPhone, iPad, Windows and macOS testing is outstanding.
