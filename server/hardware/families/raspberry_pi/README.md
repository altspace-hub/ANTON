# Raspberry Pi family — reserved

Status: `reserved` (per `family-registry.ts`). Schema entry complete; no
family-specific code yet.

## To populate this family

1. Update `family-registry.ts` entry with real config (currently has placeholder defaults)
2. Create the implementation:
   - `index.ts` exporting `FamilyImplementation`
   - `primitives/` with 5-10 verified primitive operations
   - `simulation.ts` (Wokwi for Pico, qemu for Pi 4/5)
   - `toolchain.ts` (raspberry-pi-pico-sdk for Pico; standard linux toolchain for Pi 4/5)
   - `pin-naming.ts` (BCM numbering)
3. Curate 2-5 initial HKPs (Pi 4B, Pi 5, Pico, Pico W)
4. Seed 20-50 diagnostic cases
5. Activate Raspberry Pi Foundation security advisory feed
6. Test all three paths end-to-end
7. Set status to `beta`, then `launch`

Estimate: 6-10 engineer-weeks once ESP32 patterns are proven.

Priority order suggestion (Section 11.1 of v4 spec):
1. **Raspberry Pi** (this family) — humanitarian use case alignment
2. Arduino — educational/maker
3. STM32 — industrial
4. nRF52 — BLE
5. RP2040 variants beyond what Pi family covers
