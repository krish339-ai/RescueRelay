# Independent verification

`npm run test:qa` runs independent integration/regression tests using isolated synthetic state. No external provider or notification service is called.

## Managed browser QA

After building the web workspace, the supported managed preview can launch `qa/web-preview`. Its small launcher translates the preview daemon's `--port` argument to the delivered server's `PORT` environment setting and imports the **actual** `apps/api/src/server.ts --web` entry point. It does not mock or inject API responses. The preview uses a synthetic temporary SQLite database, binds to loopback, and disables external provider configuration. Normal `npm start` remains the documented delivery path.

The `screenshots/` images are unedited captures of the actual application from the supported cloud browser, using synthetic records. Files marked `500px` were captured after ordinary browser-window resizing: the measured viewport was 500 CSS pixels wide, with 485 pixels of content width after the scrollbar. They are not 390-pixel emulation, emulator screenshots, or physical-device captures.

The browser's developer-tools policy was respected. No restricted developer tools, alternate browser automation process, or weakened Content Security Policy was used. The application rejects iframe embedding; no iframe-based responsive result is claimed.

See `docs/qa-review.md` for scope, findings, retests and unverified areas.
