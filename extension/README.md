# Browser Extensions

HTML-in-Canvas polyfill as browser extensions for Chrome and Safari.

## Build

```bash
npm run build:extension
```

This builds `extension/polyfill.js` and copies it into `extension/chrome/` and `extension/safari/`.

## Chrome

1. Run `npm run build:extension`
2. Open `chrome://extensions/`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked**
5. Select the `extension/chrome/` folder
6. After rebuilding, click the refresh icon on the extension card to reload

## Safari (requires Mac + Xcode)

1. Run `npm run build:extension`
2. Convert to Xcode project:
   ```bash
   xcrun safari-web-extension-converter extension/safari/ \
     --project-location extension/safari-xcode \
     --app-name "HTML-in-Canvas Polyfill" \
     --bundle-identifier com.repalash.html-in-canvas-polyfill \
     --swift \
     --macos-only \
     --no-open
   ```
3. Open `extension/safari-xcode/HTML-in-Canvas Polyfill.xcodeproj` in Xcode
4. Select your team in Signing & Capabilities (free Apple ID works)
5. Build and run (Cmd+R)
6. In Safari: Settings → Extensions → enable "HTML-in-Canvas Polyfill"

To allow unsigned extensions during development:
- Safari → Develop menu → Allow Unsigned Extensions (re-enable each Safari launch)

## Usage

- Pages without native HTML-in-Canvas API: polyfill installs automatically
- Pages with native API (Chrome Canary): polyfill is skipped
- Add `?polyfillHIC` to any URL to force the polyfill even when native API exists

Check the browser console for:
- `[html-in-canvas] Polyfill installed` — active
- `[html-in-canvas] Polyfill installed (forced)` — forced via URL param
- `[html-in-canvas] Native API detected, polyfill skipped.` — native, not needed
