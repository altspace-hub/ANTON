# expo-attempt/

The Expo / React Native first cut of the ANTON Business app. Preserved
for design-decision reference; **superseded by the Capacitor + Vite
implementation at `src/business/`** (commit `a3e982a` onward).

## Why this is here

The v2.0 phone-only spec landed on 2026-05-14 with React Native + Expo
SDK 52 + Expo Router as the implementation stack — same toolchain
Expo's own templates use, same one most React Native tutorials assume.
On this Windows machine it would not build.

Three compounding failures, each producing a fresh class of error each
time we patched the previous one:

1. **Gradle 8.10.2 file-locks.** `dependencies-accessors-*.lock` held
   by gradle's own pid file-locking layer, even between clean builds.
   Bumping the wrapper to 8.14.3 resolved this — but the underlying
   issue is fragile Windows + gradle daemon interaction.
2. **Compose Compiler 1.5.15 vs Kotlin 1.9.24 mismatch.**
   `expo-modules-core@2.2.3` selects its Compose Compiler extension
   off `rootProject.ext.kotlinVersion`. RN 0.76.5 pins the Kotlin
   compiler to 1.9.24 (via `libs.versions.toml`), but the default
   selection picked the 1.9.25 variant — which then refuses to compile
   against the 1.9.24 compiler. Required pinning
   `ext.kotlinVersion = '1.9.24'` in `android/build.gradle`.
3. **CMake / ninja MAX_PATH.** RN new-architecture compiles autolinked
   modules' C++ codegen. `react-native-safe-area-context`'s codegen
   path under
   `node_modules/react-native-safe-area-context/android/build/generated/source/codegen/jni/react/renderer/components/safeareacontext/safeareacontextJSI-generated.cpp.o`
   exceeds Windows's legacy 260-char path limit. Worked around by
   disabling new architecture (`newArchEnabled: false`).
4. **Expo autolinking emitted the wrong package path.** Even after
   the three fixes above, the generated `PackageList.java` contained
   `import expo.core.ExpoModulesPackage;` instead of the correct
   `import expo.modules.ExpoModulesPackage;`. The source
   `node_modules/expo/react-native.config.js` correctly says
   `expo.modules` — but `@react-native-community/cli`, resolved
   through pnpm's symlinked layout, somehow produced the old
   `expo.core` import. We never found the line of code that does the
   string substitution. The compiled class doesn't exist in Expo SDK
   52.0.49, so `javac` fails with "cannot find symbol".

Each fix unearthed the next failure. After (4) we pivoted to the
**already-proven Capacitor + Vite toolchain** the Comm App and
Companion App use on this same machine. That worked first try.

## What's preserved

- `src/services/` — the pure-logic source for `qr.ts`, `cart.ts`,
  `backup-format.ts` and their 51 vitest specs. Already ported
  verbatim to `src/business/services/` (root) — commit `0ac5192`.
- `app/` — the Expo Router screen tree. Used as the design reference
  when writing the Capacitor screens; layout + copy + state shapes
  carry over.
- `android/` — the Expo-generated Android wrapper. Build artifacts
  (`build/`, `.gradle/`, `node_modules/`) were stripped before
  archiving since none of them are tracked; gradle would regenerate
  them on first build.
- `package.json` — the Expo SDK 52 + RN 0.76.5 dependency tree, for
  reference when re-evaluating the toolchain in the future.

## What lives where now (current production)

| Concern | Old location (here) | New location |
|---|---|---|
| App entry | `app/_layout.tsx` (expo-router) | `src/business/App.tsx` (state machine) |
| Screens | `app/*.tsx` | `src/business/pages/**/*.tsx` |
| Pure-logic services | `src/services/{qr,cart,backup-format}.ts` | `src/business/services/{qr,cart,backup-format}.ts` |
| Storage | `src/services/{merchant,wallet,items,db,receipts}.ts` (expo-secure-store + expo-sqlite) | Same files at `src/business/services/` rewritten over `@aparajita/capacitor-secure-storage` + IndexedDB |
| Share / print | `src/services/{backup,kvitto-export}.ts` (expo-sharing + expo-print) | Same names at `src/business/services/`, backed by `@capacitor/share` + iframe `window.print()` |
| Native shell | `android/` (Expo + RN) | `android-business/` (Capacitor 8.3) |
| Build commands | `pnpm --filter anton-business-app start` | `pnpm build:business:cap` |
| Tests | `vitest run` from this dir | `pnpm test:business` from repo root |

If we ever revisit Expo (e.g. for an iOS App Store path that needs RN
specifically), the path is: build on macOS first to dodge the
Windows-specific issues; bump to Expo SDK 53+; verify the autolinking
bug is gone.

— archived 2026-05-14
