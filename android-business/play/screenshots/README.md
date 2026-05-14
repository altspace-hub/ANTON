# Screenshots spec

Google Play requires at minimum 2, ideally 4–8 phone screenshots per locale. This file is the spec sheet; the actual `.png` exports are not in the repo (they're designed art, not source).

## File naming

Use `phone-N.png` where N is 1–8 — Play renders them in numeric order.

```
screenshots/
├── README.md            ← this file
├── phone-1.png          ← cover screen, the strongest hook
├── phone-2.png
├── phone-3.png
…
```

## Dimensions

| Field | Value |
|---|---|
| Aspect ratio | Between 16:9 and 9:16 |
| Min edge | 320 px |
| Max edge | 3840 px |
| Recommended | 1080 × 1920 (matches our test device) |
| Format | PNG or 24-bit JPEG (PNG preferred — sharper UI text) |

## Suggested content (0.1.0 release)

| # | Screen | Annotation overlay |
|---|---|---|
| 1 | Chat tab with three contacts + one unread badge | "End-to-end encrypted. Local-first." |
| 2 | Chat thread with text + voice note + image bubble | "Text, voice, images. Disappearing or forever — your call." |
| 3 | Wassup compose with `Everyone · 1d` chips visible | "Choose who sees what. Default 24 h. Forever if you want." |
| 4 | Event detail with reminder picker open | "Invite, RSVP, remind — no cloud calendar." |
| 5 | Profile screen with QR code | "Your contact hash, your QR. No phone number." |
| 6 | Disappearing-timer sheet open in a chat | "Set a timer. Both sides honour it." |
| 7 | Live location bubble with PAUSED badge | "Live location pauses when the app sleeps." |
| 8 | Privacy section of Profile | "Read receipts and typing default OFF." |

## Branding

- **Background** (where overlay text goes): `#0D7D6C` (ANTON deep teal) on the device frame, white text.
- **Device frame**: light theme — `#F5F3EF` chrome — matches the in-app default.
- **Type**: System default (Inter on Android). Don't pull in a custom font for screenshots; Play Console renders them at multiple densities.

## Feature graphic (root of `play/`, not here)

| Field | Value |
|---|---|
| Dimensions | 1024 × 500 |
| Format | PNG (no alpha) or JPEG |
| Content | App icon + wordmark + one-line tagline |
| Tagline | "Encrypted messaging, your way" |
| Brand colours | Background `#0D7D6C`, wordmark white, icon as-is |
| Avoid | Device frames, screenshots in the feature graphic — Play overlays its own chrome around it. |
