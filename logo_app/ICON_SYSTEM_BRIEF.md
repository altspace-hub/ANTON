# ANTON Companion App — Icon System Implementation

**Status:** 📋 Spec-ready · pre-implementation
**Target:** Companion app launcher icons (mobile + desktop + web)
**Source files:** Five SVG masters in `resources/icons-source/` (delivered with this brief)
**Decision owner:** Daniel
**Implementation owner:** Claude Code

---

## What we're shipping

A two-skin icon system for the ANTON Companion App.

| Skin | Use | Files |
|---|---|---|
| **A — Inverted Teal** | Launcher (mobile + desktop), splash, social, favicon | `icon-launcher-master.svg`, `icon-launcher-foreground.svg`, `icon-launcher-background.svg`, `icon-favicon-simplified.svg` |
| **B — Mono Navy** | Whitepaper covers, deck footers, print, monochrome contexts | `icon-signature-master.svg` |

Same chevron geometry across both skins. The launcher skin is bright teal with white chevrons; the signature skin is cream with navy chevrons. The favicon is a simplified two-chevron variant — the three-layer reading collapses below ~24px, so we substitute rather than scale.

---

## Investigation (run before any changes)

Run all of these in the companion app repo. **Do not skip this phase** — the exact tooling syntax and current icon paths must be confirmed before generating anything.

```bash
# 1. Confirm Capacitor is present and check version
cat package.json | grep -i capacitor
ls -la capacitor.config.* 2>/dev/null

# 2. Identify current icon state — likely the default Android Studio placeholder
find android/app/src/main/res -name "ic_launcher*" 2>/dev/null | head -20
find ios -name "AppIcon*" 2>/dev/null | head -20
file android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png 2>/dev/null

# 3. Check whether @capacitor/assets is installed
npm list @capacitor/assets 2>/dev/null

# 4. Tauri (desktop wrapper) — confirm icon location and config
ls -la src-tauri/icons/ 2>/dev/null
grep -A3 '"icon"' src-tauri/tauri.conf.json 2>/dev/null

# 5. Web / PWA — check current favicon and manifest
ls -la public/favicon* public/icon* 2>/dev/null
cat public/manifest.json 2>/dev/null | head -30
grep -i "icon\|favicon" index.html 2>/dev/null

# 6. Check for any existing icon source files we'd be replacing
find . -name "icon-*.svg" -not -path "*/node_modules/*" 2>/dev/null
find resources -type f 2>/dev/null | head
```

**Report back** with: Capacitor version, whether `@capacitor/assets` is already installed, current state of Android/iOS/Tauri icon directories, and any existing source SVGs we'd conflict with.

---

## Phase 1 — Drop SVG masters into the repo

```bash
mkdir -p resources/icons-source
# Copy the five SVG files (delivered with this brief) into resources/icons-source/
#   icon-launcher-master.svg
#   icon-launcher-foreground.svg
#   icon-launcher-background.svg
#   icon-signature-master.svg
#   icon-favicon-simplified.svg
git add resources/icons-source/
```

**Acceptance:**
- ✅ Five SVGs present in `resources/icons-source/`
- ✅ Each opens in browser and renders the expected mark (verify the launcher master shows three white chevrons on bright teal)
- ✅ Files committed to a feature branch (suggest `feat/icon-system`)

---

## Phase 2 — Capacitor mobile assets (Android + iOS)

`@capacitor/assets` requires PNG inputs at 1024×1024. We rasterise the SVG masters first, then run the generator.

```bash
# Install if not present
npm install --save-dev @capacitor/assets

# Rasterise SVG masters → PNG inputs
# (sharp-cli is the lightest option; rsvg-convert and cairosvg also work)
npx --yes sharp-cli -i resources/icons-source/icon-launcher-master.svg \
    -o resources/icon.png resize 1024 1024
npx --yes sharp-cli -i resources/icons-source/icon-launcher-foreground.svg \
    -o resources/icon-foreground.png resize 1024 1024
npx --yes sharp-cli -i resources/icons-source/icon-launcher-background.svg \
    -o resources/icon-background.png resize 1024 1024

# Generate the full asset pack (creates Android mipmaps + iOS AppIcon set)
npx @capacitor/assets generate --android --ios
```

**Note on syntax:** `@capacitor/assets` API has changed across major versions. If the above fails, check `npx @capacitor/assets generate --help` and adapt. The required inputs are:
- `resources/icon.png` — 1024×1024, the legacy/iOS icon
- `resources/icon-foreground.png` — 1024×1024, Android adaptive foreground
- `resources/icon-background.png` — 1024×1024, Android adaptive background

**Acceptance:**
- ✅ `android/app/src/main/res/mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher.png` and `ic_launcher_round.png` are populated
- ✅ `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` references the new foreground/background drawables
- ✅ `ios/App/App/Assets.xcassets/AppIcon.appiconset/` contains all required sizes (20pt, 29pt, 40pt, 60pt, 76pt, 83.5pt, 1024pt at appropriate scales)
- ✅ Default Android Studio placeholder PNGs are gone
- ✅ Build the app (`npx cap sync` + open Android Studio / Xcode) and visually confirm the new icon on a Pixel emulator and an iOS Simulator

---

## Phase 3 — Tauri desktop assets (macOS + Windows + Linux)

```bash
# Tauri has its own icon generator; takes a 1024×1024 PNG
npx @tauri-apps/cli icon resources/icon.png

# This produces (locations may vary by Tauri version):
#   src-tauri/icons/32x32.png
#   src-tauri/icons/128x128.png
#   src-tauri/icons/128x128@2x.png
#   src-tauri/icons/icon.icns          (macOS)
#   src-tauri/icons/icon.ico           (Windows)
#   src-tauri/icons/Square*.png        (Windows Store sizes)
#   src-tauri/icons/StoreLogo.png      (Windows Store)
```

Verify `src-tauri/tauri.conf.json` references the new icon paths under `tauri.bundle.icon` (or `bundle.icon` depending on version).

**Acceptance:**
- ✅ `src-tauri/icons/` populated with the full set (icns, ico, multiple PNGs)
- ✅ `tauri.conf.json` icon array points to existing files
- ✅ `npm run tauri build` produces a binary with the correct icon in dock/taskbar (test on at least one platform; macOS preferred since Daniel is on Mac)

---

## Phase 4 — Web / PWA / favicon

```bash
# Generate favicon set from the simplified SVG (best at small sizes)
npx --yes sharp-cli -i resources/icons-source/icon-favicon-simplified.svg \
    -o public/favicon-16.png resize 16 16
npx --yes sharp-cli -i resources/icons-source/icon-favicon-simplified.svg \
    -o public/favicon-32.png resize 32 32

# Generate PWA manifest sizes from the launcher master (full three-layer)
npx --yes sharp-cli -i resources/icons-source/icon-launcher-master.svg \
    -o public/icon-192.png resize 192 192
npx --yes sharp-cli -i resources/icons-source/icon-launcher-master.svg \
    -o public/icon-512.png resize 512 512

# Modern browsers prefer SVG favicons — copy directly
cp resources/icons-source/icon-favicon-simplified.svg public/favicon.svg
```

**Update `index.html` `<head>`:**

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">
<link rel="apple-touch-icon" sizes="192x192" href="/icon-192.png">
<meta name="theme-color" content="#2DD4A8">
```

**Update `public/manifest.json`:**

```json
{
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "theme_color": "#2DD4A8",
  "background_color": "#2DD4A8"
}
```

**Note on maskable icons:** the `purpose: "maskable"` entry expects the safe-zone-inset version. Our `icon-launcher-master.svg` has chevrons spanning ~58% of canvas which is borderline-safe. For strict maskable compliance, we should also generate a maskable variant from `icon-launcher-foreground.svg` placed over the background. Out of scope for v1; flag if "Add to Home Screen" produces a clipped icon on Android Chrome.

**Acceptance:**
- ✅ Favicon visible in all major browser tabs (Chrome, Safari, Firefox)
- ✅ "Add to Home Screen" on a mobile browser produces a teal icon (not a generic letter-on-grey)
- ✅ Lighthouse PWA audit shows no icon-related warnings
- ✅ No 404s for icon paths in network tab

---

## Affected files

### New files (we add)
```
resources/icons-source/
  icon-launcher-master.svg
  icon-launcher-foreground.svg
  icon-launcher-background.svg
  icon-signature-master.svg
  icon-favicon-simplified.svg
```

### Files generated by tooling
```
resources/icon.png
resources/icon-foreground.png
resources/icon-background.png
android/app/src/main/res/mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher.png
android/app/src/main/res/mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher_round.png
android/app/src/main/res/mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher_foreground.png
android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml
android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml
android/app/src/main/res/values/ic_launcher_background.xml
ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-*.png       (~15 files)
ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json
src-tauri/icons/{32x32,128x128,128x128@2x}.png
src-tauri/icons/Square*.png                                         (Windows Store)
src-tauri/icons/icon.icns                                           (macOS)
src-tauri/icons/icon.ico                                            (Windows)
public/favicon.svg
public/favicon-{16,32}.png
public/icon-{192,512}.png
```

### Files modified
- `index.html` — favicon `<link>` tags + `theme-color`
- `public/manifest.json` — `icons` array + `theme_color` + `background_color`
- `src-tauri/tauri.conf.json` — verify (likely no changes needed if `tauri icon` writes to default paths)
- `package.json` — `@capacitor/assets` added to devDependencies

### Files explicitly NOT modified
- The `icon-signature-master.svg` is **not consumed by any tooling in this brief**. It's a static asset for whitepaper/print pipelines — leave it in `resources/icons-source/` for whoever generates the whitepaper covers.

---

## Final acceptance criteria

- ✅ Default Android Studio placeholder icon (the blue-grid X mark) no longer appears anywhere in the repo or built artifacts
- ✅ Inverted Teal launcher renders correctly on Android (Pixel emulator + 1 physical device if available)
- ✅ Adaptive icon renders correctly under all three system mask shapes: circle, rounded square, squircle (test in Pixel emulator under Settings → Display → Icon shape)
- ✅ Inverted Teal launcher renders correctly on iOS (Simulator + 1 physical device if available)
- ✅ Tauri desktop builds (at minimum macOS) show the correct icon in dock and command-tab switcher
- ✅ Browser tab favicon shows simplified two-chevron variant at 16px (visually distinct from the full launcher when zoomed)
- ✅ "Add to Home Screen" on iOS Safari and Android Chrome produces a teal icon
- ✅ All icon files committed to the feature branch with a clear commit message (`feat(icons): replace placeholder with ANTON two-skin system`)
- ✅ PR description includes screenshots of: Android home screen, iOS home screen, macOS dock, browser tab

---

## Honest caveats

- **Maskable PWA icons.** Our launcher master has chevrons at ~58% canvas width, which is borderline for the `purpose: "maskable"` 80%-safe-zone rule. If Android Chrome's "Add to Home Screen" clips the icon, we need to generate a properly inset maskable variant. Easy fix; flag the issue with a screenshot.
- **iOS does not support adaptive icons.** Only the master ships to iOS. The `*-foreground.svg` and `*-background.svg` files are Android-only.
- **Rasterisation differences.** Different SVG rasterisers (cairosvg, librsvg, sharp/libvips) can produce slightly different anti-aliasing on the chevron strokes. The visible difference is minor at launcher sizes but visible on side-by-side compare. Pick one rasteriser and stick with it for the whole pipeline.
- **Sharp-cli vs ImageMagick.** Some CI environments prefer ImageMagick; equivalent commands are `convert -background none -density 300 input.svg -resize 1024x1024 output.png`. Either is fine.
- **Tauri CLI version drift.** `npx @tauri-apps/cli icon` was added in v1.x. If the project uses Tauri v2, the command may be `npx tauri icon` directly. Check `package.json` and Tauri's own docs.

---

## Out of scope for this brief

- Animated splash screen (Lottie / SVG-animated launch sequence)
- Marketing site hero icon adoption (separate frontend repo)
- Icon variants for special events / releases (e.g. v1.0 launch variant, holiday variants)
- Co-branded versions (Advisense partnership, Mistral partnership, etc.)
- Whitepaper template integration of the Mono Navy signature mark — that goes in the whitepaper repo, not here
- App store screenshots and marketing imagery

---

## Git commit suggestion

```
feat(icons): replace Android Studio placeholder with ANTON icon system

- Add SVG masters under resources/icons-source/ (5 files)
- Generate Android mipmaps (adaptive + legacy) via @capacitor/assets
- Generate iOS AppIcon set via @capacitor/assets
- Generate Tauri desktop icons (icns, ico, PNGs) via @tauri-apps/cli
- Add PWA manifest icons + simplified favicon
- Update index.html favicon links + theme-color meta

Closes #<issue-number>
```
