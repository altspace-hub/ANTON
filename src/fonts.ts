/**
 * Self-hosted Inter + JetBrains Mono — the families named in every phone app's
 * --font-sans / --font-mono. Bundled via @fontsource so NO font request ever
 * leaves the device. Replaces the Google Fonts CDN <link>s that were in each
 * app's index.html (design-review PAY-P4 — a privacy/offline leak that was
 * present in all four apps). Weights 400/500/600/700 = normal/medium/semibold/
 * bold; @fontsource ships every unicode subset (latin/-ext/cyrillic/greek/
 * vietnamese), matching the CDN's coverage, and the browser only loads the
 * subsets a given locale needs.
 */
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';
