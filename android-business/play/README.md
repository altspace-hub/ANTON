# Play Console assets

This directory holds the metadata + listing assets uploaded with each Comm App release. The Gradle build doesn't read these — they're submitted manually (or via `gradle-play-publisher` if/when we automate it).

## Layout

```
play/
├── README.md                  ← this file
├── short-description.txt      ← ≤80 char store summary
├── full-description.txt       ← ≤4000 char store description
├── release-notes/
│   └── default.txt            ← ≤500 char per-locale; en-US default goes here
├── screenshots/
│   └── README.md              ← spec sheet, NOT the screenshots themselves
└── feature-graphic.png        ← TBD; see screenshots/README.md for specs
```

## What's NOT here yet (deliberately)

| Asset | Why missing |
|---|---|
| `screenshots/phone-{1..8}.png` | Designed art, not auto-generated. See spec sheet inside `screenshots/`. |
| `feature-graphic.png` (1024×500) | Designed art. The screenshots README documents the spec + brand colours. |
| `app-icon-512.png` | Reused from `android-comm/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`. Export the adaptive icon at 512×512. |
| Localised listings | en-US only for the 0.1.0 cut. Add `release-notes/de-DE.txt`, `release-notes/sv-SE.txt`, etc. as locales come online. |

## Versioning

`versionCode` and `versionName` are owned by `app/build.gradle`. The Play Console requires a monotonic versionCode per uploaded artifact — see the comment in `defaultConfig {}` for the bump policy.

## Release process (current, manual)

1. Bump `versionCode` (+1) and `versionName` in `app/build.gradle`.
2. Update `play/release-notes/default.txt` with what changed since the previous Play Console upload.
3. Build a signed release AAB:
   ```sh
   cd android-comm
   ./gradlew bundleRelease
   ```
   The AAB lands at `app/build/outputs/bundle/release/app-release.aab`.
4. Save the `app/build/outputs/mapping/release/mapping.txt` from the same build — Play Console wants this for stack-trace de-obfuscation.
5. Upload AAB + mapping.txt to Play Console.
6. Copy `play/full-description.txt`, `play/short-description.txt`, and `play/release-notes/default.txt` into the Play Console fields.
7. Submit for review.

If/when we automate this, `gradle-play-publisher` reads this exact directory layout.
