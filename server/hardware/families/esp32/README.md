# ESP32 family — implementation root

Launch family. Status: `launch` (per `family-registry.ts`).

## What lives here

When fully populated this directory will contain:

```
families/esp32/
├── index.ts                # exports a FamilyImplementation satisfying family-interface.ts
├── primitives/
│   ├── blink.ino
│   ├── read-adc.ino
│   ├── i2c-scan.ino
│   ├── wifi-connect.ino
│   └── deep-sleep.ino
├── simulation.ts           # Wokwi adapter wiring
├── toolchain.ts            # PlatformIO config builder
├── pin-naming.ts           # gpio-numeric convention helpers
├── secure-update.ts        # OTA-signed boot config generator
├── clang-tidy.yml          # static-analysis config template
└── photo-identification.ts # vision-model integration (Phase 5)
```

## Status

- Phase 1 (this sprint): registry entry only.
- Phase 4 (weeks 16-26 per roadmap): `index.ts`, `primitives/`, `simulation.ts`,
  `toolchain.ts`, `pin-naming.ts` populated for Tier 1 Develop path end-to-end.
- Phase 5: `photo-identification.ts`.
- Phase 7: `secure-update.ts` for Tier 3 connected devices.

See `docs/HARDWARE_BUILD_ROADMAP.md` and `ANTON_Hardware_Build_Spec_v4.md`
for the full sequence.
