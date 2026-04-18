-- ──────────────────────────────────────────────────────────────────────────────
-- 137_esp32_diagnostic_seed_cases_more.sql — 20 more authoritative ESP32 cases.
--
-- Extends the original 10 (migration 134) for Phase 5 of the Hardware Build.
-- Together the 30 cases cover the bulk of community-reported ESP32 failures
-- across BLE, partition / OTA, thermal, secure boot, peripherals (I2S, RMT,
-- SD, camera), networking (mDNS, captive portal, MQTT), and analog noise.
--
-- All cases marked authoritative=true and signed by 'anton-hardware-team'.
-- They auto-link to the seeded ESP32-WROOM-32E HKP via the trailing UPDATE.
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO diagnostic_cases
  (case_id, hkp_id, family_id, title, severity, case_data, case_schema_version,
   first_reported, last_updated, signed_by, signing_verified, authoritative, contributor_count)
VALUES

-- ── 11. BLE pairing fails after power cycle ─────────────────────────────────
('esp32-ble-pairing-fails-after-power-cycle', NULL, 'esp32',
 'BLE bonded peer reports "pairing failed" or auto-disconnects after the ESP32 reboots',
 'high',
 '{
   "symptoms": [
     {"symptom": "First-time pairing works; after ESP32 reboot the same client fails to reconnect", "observable_via": ["serial-output", "client-log"], "confidence_when_present": 0.9},
     {"symptom": "Phone / client repeatedly prompts for new pairing PIN despite already being bonded", "observable_via": ["client-log"], "confidence_when_present": 0.85},
     {"symptom": "esp_ble_get_bond_device_num() returns 0 after reboot even though pairing succeeded earlier", "observable_via": ["serial-output"], "confidence_when_present": 0.95}
   ],
   "probable_causes": [
     {"cause": "NVS partition that holds bonding info was erased or never persisted. Default Arduino BLE library does not always commit bonding to NVS until explicitly told.", "confidence": 0.8, "evidence": ["espressif-esp-idf-docs:bluedroid-bond-storage"]},
     {"cause": "Different IRK/LTK key pair generated on each boot because esp_ble_gap_set_security_param() is called with create_bond=false or the bond store was wiped by an OTA.", "confidence": 0.6, "evidence": ["community"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "Ensure NVS is initialised before BLE init: nvs_flash_init() must succeed and not be erased mid-session. Check that the ''nvs'' partition exists in the partition table and was not overwritten by a custom partitioning step.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"], "preferred": true},
     {"resolution_id": "r2", "description": "Set ESP_LE_AUTH_REQ_SC_MITM_BOND in the security param and call esp_ble_gap_config_local_privacy(true). Confirm bonded count > 0 in serial after pairing.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"]},
     {"resolution_id": "r3", "description": "On the client side, remove the stale bond from the OS Bluetooth settings before re-attempting — many phones cache the old IRK and refuse to renegotiate silently.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]}
   ],
   "related_cases": ["esp32-spiffs-flash-wear-failure"],
   "diagnostic_questions": [
     "Is the failure on the very first reboot after pairing, or only after several reboots?",
     "Does esp_ble_get_bond_device_num() report > 0 immediately after pairing succeeds?",
     "Did you recently change the partition table or perform an OTA?"
   ]
 }'::jsonb,
 '1.0', '2024-06-12', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0),

-- ── 12. TWAI / CAN bus goes bus-off ─────────────────────────────────────────
('esp32-twai-can-bus-bus-off', NULL, 'esp32',
 'TWAI driver enters BUS_OFF state; transmits succeed for a while then stop entirely',
 'high',
 '{
   "symptoms": [
     {"symptom": "twai_get_status_info() reports state TWAI_STATE_BUS_OFF after some traffic", "observable_via": ["serial-output"], "confidence_when_present": 0.95},
     {"symptom": "TX error counter hits 256 and recovery never completes", "observable_via": ["serial-output"], "confidence_when_present": 0.9},
     {"symptom": "Other CAN nodes on the same bus continue to communicate normally", "observable_via": ["bus-analyzer"], "confidence_when_present": 0.7}
   ],
   "probable_causes": [
     {"cause": "Missing or wrong-value 120 Ω termination resistor at one or both bus ends. Any termination error at gigahertz transceiver speeds is fatal.", "confidence": 0.8, "evidence": ["iso-11898-2", "community"]},
     {"cause": "Bit-rate mismatch between the ESP32 TWAI config and the rest of the bus (one node at 500 kbit/s, others at 250 kbit/s).", "confidence": 0.6, "evidence": ["community"]},
     {"cause": "Transceiver IC is not 5 V tolerant on its CAN_H/CAN_L pins or its 3.3 V VIO supply is missing — common with TJA1050 driven from a 5 V system that lacks the ESP32''s 3.3 V on the VIO leg.", "confidence": 0.5, "evidence": ["community"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "Confirm 120 Ω termination at each end of the bus (measure 60 Ω across CAN_H and CAN_L with the bus powered down).", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"], "preferred": true},
     {"resolution_id": "r2", "description": "Match the bit-rate exactly between all nodes. Use SN65HVD230 (3.3 V native) instead of TJA1050 if you do not want a separate 5 V supply.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]},
     {"resolution_id": "r3", "description": "Call twai_initiate_recovery() after detecting BUS_OFF; do not assume the driver auto-recovers.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"]}
   ],
   "related_cases": [],
   "diagnostic_questions": [
     "What is the bit-rate configured? What about the other nodes?",
     "Have you measured the resistance across CAN_H and CAN_L with bus powered off?",
     "Which transceiver IC are you using and what is its VIO voltage?"
   ]
 }'::jsonb,
 '1.0', '2024-04-30', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0),

-- ── 13. Partition table mismatch after OTA ─────────────────────────────────
('esp32-partition-table-mismatch', NULL, 'esp32',
 'Boot loop or "invalid header" after firmware change; partition_table_check fails',
 'high',
 '{
   "symptoms": [
     {"symptom": "Serial console: ''invalid header: 0xffffffff'' or ''partition table not found''", "observable_via": ["serial-output"], "confidence_when_present": 0.95},
     {"symptom": "Boot loop after switching between Arduino IDE and PlatformIO, or between ESP-IDF versions", "observable_via": ["serial-output"], "confidence_when_present": 0.85},
     {"symptom": "esptool.py read_flash 0x8000 0xc00 shows non-default partition layout", "observable_via": ["esptool"], "confidence_when_present": 0.9}
   ],
   "probable_causes": [
     {"cause": "Build set a custom partition table at 0x8000 but the bootloader was compiled expecting the default one.", "confidence": 0.7, "evidence": ["espressif-esp-idf-docs:partition-table"]},
     {"cause": "OTA firmware was larger than the OTA slot defined in the existing partition table; partition_table_check failed silently.", "confidence": 0.5, "evidence": ["community"]},
     {"cause": "Flash size mismatch: image was built for 8 MB flash but the module has only 4 MB; the partition table addresses out of range.", "confidence": 0.5, "evidence": ["community"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "Erase entire flash with esptool.py erase_flash, then re-flash bootloader + partition table + app from a clean build with matching configuration.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"], "preferred": true},
     {"resolution_id": "r2", "description": "Verify the partition table CSV matches what the bootloader expects (idf.py partition-table). For Arduino, set Tools → Partition Scheme to a known-good value and re-flash.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]},
     {"resolution_id": "r3", "description": "Confirm flash size with esptool.py flash_id; rebuild with matching CONFIG_ESPTOOLPY_FLASHSIZE.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]}
   ],
   "related_cases": ["esp32-ota-failure-boot-loop"],
   "diagnostic_questions": [
     "What does esptool.py read_flash 0x8000 0xc00 show at the start of the partition table?",
     "Did the failure begin after switching between IDEs, ESP-IDF versions, or partition schemes?",
     "What flash size does esptool.py flash_id report vs what your build configured?"
   ]
 }'::jsonb,
 '1.0', '2023-11-08', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0),

-- ── 14. Thermal throttle / shutdown ────────────────────────────────────────
('esp32-thermal-throttle-or-shutdown', NULL, 'esp32',
 'Module reboots, slows, or loses Wi-Fi at high ambient temperatures',
 'high',
 '{
   "symptoms": [
     {"symptom": "Watchdog resets only when ambient is above ~50 °C", "observable_via": ["temperature-correlation"], "confidence_when_present": 0.85},
     {"symptom": "Wi-Fi disconnects rise sharply with temperature; deep sleep current also rises", "observable_via": ["temperature-correlation", "current-meter"], "confidence_when_present": 0.7},
     {"symptom": "Touch sensor channels drift or false-trigger at high temp", "observable_via": ["serial-output"], "confidence_when_present": 0.6}
   ],
   "probable_causes": [
     {"cause": "Enclosure has insufficient thermal venting — internal temperature rises above the 85 °C operating max even when ambient is moderate.", "confidence": 0.7, "evidence": ["physically-verified"]},
     {"cause": "Module stacked under another heat-generating component (regulator, motor driver, display backlight).", "confidence": 0.5, "evidence": ["community"]},
     {"cause": "Counterfeit module with relabelled silicon rated for narrower temp range than claimed.", "confidence": 0.3, "evidence": ["community"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "Add ventilation slots above the module or attach a heat-spreader plate (copper foil) to the metal can.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community", "physically-verified"], "preferred": true},
     {"resolution_id": "r2", "description": "Reduce Wi-Fi TX power (esp_wifi_set_max_tx_power) — the radio is the dominant heat source under load.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"]},
     {"resolution_id": "r3", "description": "Move heat-generating components away from the module on the PCB or to the opposite side of the board.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]}
   ],
   "related_cases": ["esp32-counterfeit-or-misidentified-module", "esp32-touch-sensor-false-trigger"],
   "diagnostic_questions": [
     "What is the ambient temperature when the failure occurs?",
     "Have you measured the metal can temperature under load with a thermocouple or IR thermometer?",
     "Is the module enclosed or open to airflow?"
   ]
 }'::jsonb,
 '1.0', '2024-07-18', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0),

-- ── 15. Cant connect to hidden SSID ────────────────────────────────────────
('esp32-wifi-cant-connect-to-hidden-ssid', NULL, 'esp32',
 'ESP32 connects to broadcast SSIDs but never to a hidden SSID',
 'moderate',
 '{
   "symptoms": [
     {"symptom": "Same credentials work for visible SSID but fail for hidden one", "observable_via": ["test-isolation"], "confidence_when_present": 0.95},
     {"symptom": "esp_wifi_connect() returns OK but no IP is acquired", "observable_via": ["serial-output"], "confidence_when_present": 0.9}
   ],
   "probable_causes": [
     {"cause": "wifi_sta_config_t.scan_method is set to WIFI_FAST_SCAN (default) which does not actively probe hidden SSIDs.", "confidence": 0.85, "evidence": ["espressif-esp-idf-docs:wifi-config"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "Set wifi_sta_config_t.scan_method = WIFI_ALL_CHANNEL_SCAN and channel = 0 (auto), then esp_wifi_connect(). Hidden SSID requires active probing.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"], "preferred": true},
     {"resolution_id": "r2", "description": "On Arduino, use WiFi.begin(ssid, pass) but verify that WiFi.setMinSecurity(WIFI_AUTH_OPEN) is not too permissive (some APs reject this).", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]}
   ],
   "related_cases": ["esp32-wifi-disconnect-60s-cycle"],
   "diagnostic_questions": [
     "Is the SSID actually hidden, or just on a non-2.4 GHz band? (ESP32 is 2.4 GHz only.)",
     "What is the value of wifi_config.sta.scan_method in your code?"
   ]
 }'::jsonb,
 '1.0', '2024-09-02', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0),

-- ── 16. Touch sensor false trigger ─────────────────────────────────────────
('esp32-touch-sensor-false-trigger', NULL, 'esp32',
 'Touch button reports trigger with no human contact; false rate rises with humidity or EMI',
 'moderate',
 '{
   "symptoms": [
     {"symptom": "touchRead() values drift or spike randomly", "observable_via": ["serial-output"], "confidence_when_present": 0.9},
     {"symptom": "False triggers cluster when motors / chargers / fluorescent lights cycle on", "observable_via": ["timing-correlation"], "confidence_when_present": 0.7}
     ,
     {"symptom": "Higher false rate in humid environments", "observable_via": ["environmental-correlation"], "confidence_when_present": 0.6}
   ],
   "probable_causes": [
     {"cause": "Touch trace is unshielded and acts as antenna for nearby EMI sources.", "confidence": 0.7, "evidence": ["community"]},
     {"cause": "Default touch threshold is too sensitive for the actual capacitance environment of the build.", "confidence": 0.6, "evidence": ["espressif-documentation"]},
     {"cause": "Moisture between touch pad and ground reference creates a parasitic capacitor.", "confidence": 0.4, "evidence": ["physically-verified"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "Calibrate threshold dynamically: read touchRead() at boot in a known untouched state, average over 100 samples, set threshold to that value × 0.7.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"], "preferred": true},
     {"resolution_id": "r2", "description": "Add a guard ring around the touch pad connected to ground; route the touch trace short and direct.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]},
     {"resolution_id": "r3", "description": "Apply a hydrophobic coating on touch pads in humid deployments; consider a debounce window of 30-50 ms in firmware.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]}
   ],
   "related_cases": ["esp32-thermal-throttle-or-shutdown"],
   "diagnostic_questions": [
     "What does touchRead() return in untouched and touched states? What is your threshold?",
     "Is the touch pad physically isolated from moisture / EMI sources?"
   ]
 }'::jsonb,
 '1.0', '2024-03-22', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0),

-- ── 17. I2S audio static / distortion ──────────────────────────────────────
('esp32-i2s-audio-distortion-static', NULL, 'esp32',
 'I2S DAC or codec output has static, hiss, or sample dropouts',
 'moderate',
 '{
   "symptoms": [
     {"symptom": "Continuous hiss audible even with silent buffer", "observable_via": ["audio-output"], "confidence_when_present": 0.9},
     {"symptom": "Periodic clicks / dropouts every few seconds correlated with Wi-Fi activity", "observable_via": ["audio-output", "timing-correlation"], "confidence_when_present": 0.7},
     {"symptom": "Sample-rate sounds too high or too low (chipmunk / slow-mo)", "observable_via": ["audio-output"], "confidence_when_present": 0.85}
   ],
   "probable_causes": [
     {"cause": "I2S BCLK frequency mismatch between ESP32 config and external DAC expectation.", "confidence": 0.8, "evidence": ["espressif-documentation"]},
     {"cause": "Power supply noise from the same 3V3 rail powering the DAC and the noisy ESP32 radio.", "confidence": 0.7, "evidence": ["community", "physically-verified"]},
     {"cause": "DMA buffer underrun: i2s_write fed slower than the codec consumes.", "confidence": 0.6, "evidence": ["community"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "Use a separate, well-decoupled supply for the audio codec (LDO regulator with audio-grade caps).", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community", "physically-verified"], "preferred": true},
     {"resolution_id": "r2", "description": "Verify BCLK and LRCLK with a scope; recompute i2s_config.sample_rate × bits_per_sample × channels.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"]},
     {"resolution_id": "r3", "description": "Increase i2s_config.dma_buf_count and dma_buf_len so an underrun cannot occur during longer Wi-Fi tasks.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]}
   ],
   "related_cases": [],
   "diagnostic_questions": [
     "Which DAC / codec are you driving? Same 3V3 rail as the ESP32?",
     "Have you scoped BCLK and LRCLK to confirm timing?",
     "What dma_buf_count and dma_buf_len did you configure?"
   ]
 }'::jsonb,
 '1.0', '2024-02-14', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0),

-- ── 18. Deep sleep RTC memory loss ─────────────────────────────────────────
('esp32-deep-sleep-rtc-memory-loss', NULL, 'esp32',
 'Variables marked RTC_DATA_ATTR are zero / garbage after deep-sleep wake',
 'moderate',
 '{
   "symptoms": [
     {"symptom": "RTC_DATA_ATTR int counter resets to 0 on each wake", "observable_via": ["serial-output"], "confidence_when_present": 0.95},
     {"symptom": "Wakeup reason reports ESP_SLEEP_WAKEUP_UNDEFINED (cold boot) when timer wake was expected", "observable_via": ["serial-output"], "confidence_when_present": 0.9}
   ],
   "probable_causes": [
     {"cause": "Brownout / brief power loss during sleep — RTC SRAM is volatile, only survives if power is maintained.", "confidence": 0.7, "evidence": ["espressif-documentation"]},
     {"cause": "Module entered hibernation rather than deep sleep — hibernation does not preserve RTC SRAM.", "confidence": 0.5, "evidence": ["espressif-documentation"]},
     {"cause": "External power switch / USB host power-cycled the module on wake-up.", "confidence": 0.4, "evidence": ["community"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "Persist counters / state to NVS instead of RTC_DATA_ATTR if the deployment cannot guarantee uninterrupted power across the sleep period.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"], "preferred": true},
     {"resolution_id": "r2", "description": "Confirm sleep mode used: esp_deep_sleep_start() preserves RTC SRAM; esp_sleep_disable_wakeup_source(ESP_SLEEP_WAKEUP_ALL) plus hibernation mode does not.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"]},
     {"resolution_id": "r3", "description": "Add a supercap (1 F, 5.5 V) on the 3V3 rail to ride through brief power dips during long sleep cycles in battery-powered builds.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["physically-verified"]}
   ],
   "related_cases": ["esp32-deep-sleep-wake-failure", "esp32-brownout-bad-usb-power"],
   "diagnostic_questions": [
     "Which sleep mode are you using? Deep sleep or hibernation?",
     "Does esp_sleep_get_wakeup_cause() return the expected source?",
     "Have you measured supply voltage across the sleep window?"
   ]
 }'::jsonb,
 '1.0', '2024-05-09', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0),

-- ── 19. Secure boot key burn bricks the chip ───────────────────────────────
('esp32-secure-boot-key-burn-bricked', NULL, 'esp32',
 'Module no longer boots after enabling Secure Boot V2; eFuses cannot be reverted',
 'critical',
 '{
   "symptoms": [
     {"symptom": "rst:0x10 (RTCWDT_RTC_RESET),boot:0x0 (DOWNLOAD(USB/UART0/1)) followed by no further output", "observable_via": ["serial-output"], "confidence_when_present": 0.95},
     {"symptom": "esptool.py refuses to flash: ''Secure Boot V2 enabled, but signature verification failed''", "observable_via": ["esptool"], "confidence_when_present": 0.9},
     {"symptom": "No way to recover — eFuses are one-time programmed", "observable_via": ["espefuse"], "confidence_when_present": 1.0}
   ],
   "probable_causes": [
     {"cause": "Secure Boot V2 was enabled with the wrong signing key, or the corresponding private key was lost.", "confidence": 0.8, "evidence": ["espressif-esp-idf-docs:secure-boot-v2"]},
     {"cause": "Signed firmware was built with a key whose hash does not match the burned eFuse digest.", "confidence": 0.6, "evidence": ["community"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "There is no software recovery once eFuses are burned. The module must be physically replaced. Document this clearly in any Tier 2 / Tier 3 build that enables Secure Boot — the production line MUST keep the signing key in hardware-protected storage.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"], "preferred": true},
     {"resolution_id": "r2", "description": "Before burning Secure Boot eFuses, always verify with espefuse.py summary that you can read the chip; do a dry-run flash of a signed image first; keep the key escrowed.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"], "anti_pattern": false},
     {"resolution_id": "r3", "description": "DO NOT enable Secure Boot V2 on the development module unless absolutely necessary. Use a separate hardware key-management ceremony that is documented and rehearsed.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"]}
   ],
   "related_cases": ["esp32-flash-encryption-mismatch"],
   "diagnostic_questions": [
     "Did you burn Secure Boot V2 eFuses on this module?",
     "Do you still have the signing key (not just the public hash)?",
     "Is this a development module or a production unit?"
   ]
 }'::jsonb,
 '1.0', '2024-11-19', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0),

-- ── 20. Flash encryption key mismatch ──────────────────────────────────────
('esp32-flash-encryption-mismatch', NULL, 'esp32',
 'After enabling flash encryption, module boots once then fails on subsequent flashes',
 'critical',
 '{
   "symptoms": [
     {"symptom": "First flash with --encrypt works; subsequent flashes load garbage and reset", "observable_via": ["serial-output"], "confidence_when_present": 0.9},
     {"symptom": "Bootloader prints ''flash read err'' or ''invalid header''", "observable_via": ["serial-output"], "confidence_when_present": 0.85}
   ],
   "probable_causes": [
     {"cause": "Re-flashing in plaintext after encryption is enabled — partitions become unreadable to the encrypted bootloader.", "confidence": 0.85, "evidence": ["espressif-esp-idf-docs:flash-encryption"]},
     {"cause": "Used a different encryption key on a re-flash (the on-chip key is one-time-burned).", "confidence": 0.6, "evidence": ["community"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "Always re-flash with --encrypt once flash encryption is enabled. Use ''idf.py encrypted-flash'' or esptool.py --encrypt flag.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"], "preferred": true},
     {"resolution_id": "r2", "description": "Build with CONFIG_SECURE_FLASH_REQUIRE_ALREADY_ENABLED=y so subsequent builds refuse to flash plaintext to a chip whose encryption is on.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"]},
     {"resolution_id": "r3", "description": "Like Secure Boot — once eFuses are burned, key recovery is impossible. Document this in your production runbook.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"]}
   ],
   "related_cases": ["esp32-secure-boot-key-burn-bricked"],
   "diagnostic_questions": [
     "Did you re-flash without --encrypt after enabling flash encryption?",
     "Does espefuse.py summary confirm encryption eFuses are burned?"
   ]
 }'::jsonb,
 '1.0', '2024-08-04', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0),

-- ── 21. mDNS service not discoverable ──────────────────────────────────────
('esp32-mdns-service-not-discoverable', NULL, 'esp32',
 'mDNS hostname / service does not resolve from clients on the same network',
 'moderate',
 '{
   "symptoms": [
     {"symptom": "ping <hostname>.local fails from any client", "observable_via": ["client-log"], "confidence_when_present": 0.9},
     {"symptom": "dns-sd / avahi-browse on a client shows no _<service>._tcp record", "observable_via": ["client-log"], "confidence_when_present": 0.85}
   ],
   "probable_causes": [
     {"cause": "Router blocks multicast (Bonjour) — common on enterprise / mesh-extender Wi-Fi.", "confidence": 0.6, "evidence": ["community"]},
     {"cause": "ESP32 mDNS started before the network interface had an IP — service was never advertised.", "confidence": 0.5, "evidence": ["espressif-documentation"]},
     {"cause": "Two devices announcing the same hostname, causing the responder to back off.", "confidence": 0.4, "evidence": ["community"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "Defer mdns_init() until after IP_EVENT_STA_GOT_IP fires.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"], "preferred": true},
     {"resolution_id": "r2", "description": "Test the device IP directly first — if direct IP works but .local does not, the issue is router multicast handling.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]},
     {"resolution_id": "r3", "description": "Use a unique hostname per device (include the chip ID or MAC suffix).", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]}
   ],
   "related_cases": [],
   "diagnostic_questions": [
     "Can you ping the device IP directly (bypassing mDNS)?",
     "Does the router pass multicast (Bonjour) — most consumer routers do, most enterprise APs do not by default?",
     "Is more than one device using the same hostname?"
   ]
 }'::jsonb,
 '1.0', '2024-01-28', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0),

-- ── 22. SPI flash corruption after sudden reset ────────────────────────────
('esp32-spi-flash-corruption-after-reset', NULL, 'esp32',
 'NVS or SPIFFS appears corrupted after unexpected power loss',
 'high',
 '{
   "symptoms": [
     {"symptom": "nvs_open returns ESP_ERR_NVS_CORRUPT_KEY_PART", "observable_via": ["serial-output"], "confidence_when_present": 0.9},
     {"symptom": "SPIFFS / LittleFS files truncate or contain garbage bytes after a power yank", "observable_via": ["filesystem-check"], "confidence_when_present": 0.85}
   ],
   "probable_causes": [
     {"cause": "Power was lost mid-write to the flash sector — NOR flash sectors do not commit atomically.", "confidence": 0.85, "evidence": ["espressif-documentation"]},
     {"cause": "Build did not enable NVS encryption + integrity-verified read paths.", "confidence": 0.4, "evidence": ["espressif-documentation"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "Use NVS with wear-levelling enabled + checksum each value at read time. Treat NVS as eventually-consistent, not transactional.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"], "preferred": true},
     {"resolution_id": "r2", "description": "Add a supercap or large bulk capacitor to provide ~50 ms of post-power-loss runtime; firmware detects brownout warning and finishes any pending write before sleeping.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["physically-verified"]},
     {"resolution_id": "r3", "description": "Switch from SPIFFS to LittleFS — its journaling is more resilient to mid-write power loss.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]}
   ],
   "related_cases": ["esp32-spiffs-flash-wear-failure", "esp32-brownout-bad-usb-power"],
   "diagnostic_questions": [
     "Was there a power loss / reset event around the time the corruption appeared?",
     "Are you using SPIFFS, LittleFS, or NVS for the affected data?",
     "Is the supply backed up by any capacitance / battery?"
   ]
 }'::jsonb,
 '1.0', '2024-02-29', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0),

-- ── 23. WS2812 / NeoPixel flicker / wrong colour ───────────────────────────
('esp32-ws2812-led-flicker-or-wrong-color', NULL, 'esp32',
 'WS2812B / NeoPixel strip shows wrong colours, flickers, or first LED is corrupt',
 'moderate',
 '{
   "symptoms": [
     {"symptom": "First LED of the strip shows random colours; rest works", "observable_via": ["visual-inspection"], "confidence_when_present": 0.9},
     {"symptom": "Random LEDs flicker even with static colour buffer", "observable_via": ["visual-inspection"], "confidence_when_present": 0.85},
     {"symptom": "Colours shift toward red/green/blue after long strip lengths", "observable_via": ["visual-inspection"], "confidence_when_present": 0.6}
   ],
   "probable_causes": [
     {"cause": "ESP32 GPIO is 3.3 V; WS2812B expects 5 V data lines. The first LED often acts as a level shifter for the rest, but its own input is glitchy.", "confidence": 0.85, "evidence": ["community", "physically-verified"]},
     {"cause": "Long data line acts as antenna and sees reflections — RMT timing tight enough that small jitter corrupts pixels.", "confidence": 0.5, "evidence": ["community"]},
     {"cause": "Voltage drop along the strip — far end runs at 4.2 V instead of 5.0 V, shifts colour temperature.", "confidence": 0.4, "evidence": ["physically-verified"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "Add a 74AHCT125 or SN74HCT245 level shifter between the ESP32 GPIO and the strip data input. ~$0.40, eliminates the issue.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"], "preferred": true},
     {"resolution_id": "r2", "description": "Inject 5 V power every 1-2 m along long strips to fight voltage drop.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["physically-verified"]},
     {"resolution_id": "r3", "description": "Use the RMT driver (via ESP-IDF) rather than bit-banged Arduino libraries for tighter timing.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]}
   ],
   "related_cases": [],
   "diagnostic_questions": [
     "How many LEDs in the strip and how is power injected?",
     "Is there a level shifter between the ESP32 and the strip input?",
     "Which Arduino library or RMT driver are you using?"
   ]
 }'::jsonb,
 '1.0', '2023-09-18', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0),

-- ── 24. UART data corruption / loss ────────────────────────────────────────
('esp32-uart-data-corruption-or-loss', NULL, 'esp32',
 'Bytes corrupted or dropped on UART link to a sensor / module',
 'moderate',
 '{
   "symptoms": [
     {"symptom": "Frame check fails on a constant-rate sensor stream", "observable_via": ["serial-output"], "confidence_when_present": 0.9},
     {"symptom": "Errors only appear at higher baud rates", "observable_via": ["test-isolation"], "confidence_when_present": 0.85}
   ],
   "probable_causes": [
     {"cause": "Baud rate drift between the ESP32 UART clock and the peer; default ESP32 UART uses APB clock (80 MHz) which divides cleanly only for some baud rates.", "confidence": 0.6, "evidence": ["espressif-documentation"]},
     {"cause": "Long UART cable acts as antenna; without a logic-level transceiver, EMI corrupts bytes.", "confidence": 0.6, "evidence": ["community"]},
     {"cause": "Hardware FIFO overflowed because the firmware did not service the UART fast enough.", "confidence": 0.5, "evidence": ["espressif-documentation"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "Lower the baud rate (try 9600 → 38400 → 115200) and confirm whether the failure rate scales.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"], "preferred": true},
     {"resolution_id": "r2", "description": "For cables > 30 cm, use RS-485 (MAX485) or differential signalling. UART over jumper wires is fine on a breadboard but never in the field.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]},
     {"resolution_id": "r3", "description": "Increase UART RX buffer (uart_driver_install rx_buffer_size) and read in a dedicated FreeRTOS task.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"]}
   ],
   "related_cases": [],
   "diagnostic_questions": [
     "What baud rate? Does the failure rate change if you halve / double it?",
     "How long is the cable? Are you using single-ended UART or RS-485?",
     "What is your RX buffer size and is the read loop in its own task?"
   ]
 }'::jsonb,
 '1.0', '2024-04-08', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0),

-- ── 25. ESP32-CAM init failure or corrupt image ────────────────────────────
('esp32-camera-init-or-image-corrupt', NULL, 'esp32',
 'esp_camera_init returns error, or captured frames are striped / partial',
 'high',
 '{
   "symptoms": [
     {"symptom": "esp_camera_init returns ESP_ERR_CAMERA_NOT_DETECTED", "observable_via": ["serial-output"], "confidence_when_present": 0.95},
     {"symptom": "Frames have horizontal bars or are half-blank", "observable_via": ["captured-frame"], "confidence_when_present": 0.9},
     {"symptom": "Random crashes during esp_camera_fb_get()", "observable_via": ["serial-output"], "confidence_when_present": 0.7}
   ],
   "probable_causes": [
     {"cause": "Pin assignments in camera_config_t do not match the specific ESP32-CAM board variant (AI-Thinker vs ESP-EYE vs ESP-S3-EYE all differ).", "confidence": 0.8, "evidence": ["community"]},
     {"cause": "PSRAM not enabled in build — VGA+ frame buffers exceed onboard SRAM.", "confidence": 0.7, "evidence": ["espressif-documentation"]},
     {"cause": "Insufficient power supply — camera draws ~150 mA additional at peak; underpowered USB ports cause partial image corruption.", "confidence": 0.6, "evidence": ["physically-verified"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "Verify pin map in camera_config_t against the silkscreen of your specific board. AI-Thinker pins differ from M5Stack which differ from ESP-EYE.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"], "preferred": true},
     {"resolution_id": "r2", "description": "Enable PSRAM (Tools → PSRAM = Enabled in Arduino, or CONFIG_SPIRAM_USE_MEMMAP) for any frame size above QQVGA.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"]},
     {"resolution_id": "r3", "description": "Power via the 5 V pin from a 5 V / 2 A supply, not via the USB-serial dongle.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["physically-verified"]}
   ],
   "related_cases": ["esp32-psram-access-crash", "esp32-brownout-bad-usb-power"],
   "diagnostic_questions": [
     "Which exact ESP32-CAM board variant do you have? (AI-Thinker, ESP-EYE, M5, etc.)",
     "Is PSRAM enabled in the build configuration?",
     "What is the power supply rating?"
   ]
 }'::jsonb,
 '1.0', '2023-12-04', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0),

-- ── 26. SD card mount fail in SPI mode ─────────────────────────────────────
('esp32-sd-card-mount-fail-spi-mode', NULL, 'esp32',
 'SD card mount fails or read errors via SPI; same card works on a Raspberry Pi',
 'moderate',
 '{
   "symptoms": [
     {"symptom": "SD.begin() returns false", "observable_via": ["serial-output"], "confidence_when_present": 0.9},
     {"symptom": "Mount succeeds but f_open returns FR_DISK_ERR intermittently", "observable_via": ["serial-output"], "confidence_when_present": 0.7}
   ],
   "probable_causes": [
     {"cause": "Card is SDHC / SDXC; many older Arduino libraries default to lower-spec SDSC commands that newer cards reject.", "confidence": 0.6, "evidence": ["community"]},
     {"cause": "SPI clock too high — 25 MHz is the default; some no-name cards only reliably work at 4 MHz.", "confidence": 0.6, "evidence": ["community"]},
     {"cause": "Missing 10 kΩ pull-up on CS line; ESP32 boots with CS floating which puts the card into an undefined state.", "confidence": 0.5, "evidence": ["community"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "Lower SPI clock with SD.begin(SD_CS_PIN, SPI, 4000000). 4 MHz works with virtually every card.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"], "preferred": true},
     {"resolution_id": "r2", "description": "Add 10 kΩ pull-ups on CS, MOSI, MISO. The bus is undefined at boot and some cards latch into the wrong state.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]},
     {"resolution_id": "r3", "description": "Try SDIO (4-bit) mode instead of SPI on boards that support it (ESP32 + SDMMC peripheral).", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"]}
   ],
   "related_cases": [],
   "diagnostic_questions": [
     "What is the card capacity (SDSC <2 GB / SDHC 4-32 GB / SDXC > 32 GB)?",
     "What SPI clock are you using?",
     "Are there pull-ups on the bus lines?"
   ]
 }'::jsonb,
 '1.0', '2024-03-11', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0),

-- ── 27. Captive portal does not redirect ───────────────────────────────────
('esp32-captive-portal-doesnt-redirect', NULL, 'esp32',
 'Connecting to ESP32 SoftAP shows captive portal banner but does not auto-open the config page',
 'moderate',
 '{
   "symptoms": [
     {"symptom": "OS shows ''Sign in to Wi-Fi'' but tapping does nothing or shows a blank page", "observable_via": ["client-log"], "confidence_when_present": 0.9},
     {"symptom": "Manually browsing to 192.168.4.1 works", "observable_via": ["test-isolation"], "confidence_when_present": 0.95}
   ],
   "probable_causes": [
     {"cause": "DNS server not running on the ESP32 — the captive-portal redirect needs to capture all DNS queries and answer with the SoftAP IP.", "confidence": 0.85, "evidence": ["community"]},
     {"cause": "iOS / Android probe URL not handled — modern OSes test specific URLs (captive.apple.com, connectivitycheck.gstatic.com) and only show the portal if those return non-204.", "confidence": 0.7, "evidence": ["community"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "Add a DNSServer that returns the SoftAP IP for every query (e.g., DNSServer.start(53, ''*'', WiFi.softAPIP())).", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"], "preferred": true},
     {"resolution_id": "r2", "description": "Handle the captive-portal probe URLs explicitly: /generate_204, /hotspot-detect.html, /connecttest.txt. Return a 200 with a <a href> redirect to the config page.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]}
   ],
   "related_cases": [],
   "diagnostic_questions": [
     "Are you running a DNSServer on the ESP32 SoftAP?",
     "Which client OS / browser is testing it?"
   ]
 }'::jsonb,
 '1.0', '2024-06-25', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0),

-- ── 28. MQTT disconnect on keepalive ───────────────────────────────────────
('esp32-mqtt-disconnect-keepalive', NULL, 'esp32',
 'MQTT broker disconnects ESP32 client every ~60 seconds with KEEPALIVE_TIMEOUT',
 'moderate',
 '{
   "symptoms": [
     {"symptom": "Broker log shows ''Client <id> has exceeded timeout, disconnecting''", "observable_via": ["broker-log"], "confidence_when_present": 0.95},
     {"symptom": "ESP32 reconnects, gets disconnected again ~60s later, repeating", "observable_via": ["serial-output"], "confidence_when_present": 0.95}
   ],
   "probable_causes": [
     {"cause": "Client keepalive interval ≥ 1.5× broker keepalive — broker times out before client sends PINGREQ.", "confidence": 0.7, "evidence": ["mqtt-spec"]},
     {"cause": "Long-running blocking operation in main loop prevents the MQTT client task from sending PINGREQ.", "confidence": 0.6, "evidence": ["community"]},
     {"cause": "Wi-Fi reconnect dropping the TCP socket without explicit MQTT disconnect.", "confidence": 0.4, "evidence": ["community"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "Set keepalive on the ESP32 client to half of the broker''s configured value (e.g., 30 s if broker is 60 s).", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"], "preferred": true},
     {"resolution_id": "r2", "description": "Move long-running work off the main loop into a dedicated FreeRTOS task; ensure mqtt_client.loop() runs at least once per second.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]},
     {"resolution_id": "r3", "description": "Subscribe to wifi events and explicitly disconnect+reconnect MQTT on STA_DISCONNECTED.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]}
   ],
   "related_cases": ["esp32-wifi-disconnect-60s-cycle"],
   "diagnostic_questions": [
     "What keepalive interval is set on the client and broker?",
     "Is there a blocking operation (delay, large file write, network call) in your main loop?"
   ]
 }'::jsonb,
 '1.0', '2024-05-30', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0),

-- ── 29. Ground loop / EMI on analog sensor input ───────────────────────────
('esp32-ground-loop-or-emi-sensor-noise', NULL, 'esp32',
 'Analog sensor reading has ~50/60 Hz hum or random spikes; clean readings on bench but not in installation',
 'moderate',
 '{
   "symptoms": [
     {"symptom": "Reading oscillates at 50 Hz (Europe) or 60 Hz (US/JP) when AC mains powered", "observable_via": ["fft", "scope"], "confidence_when_present": 0.9},
     {"symptom": "Spikes correlate with motor / contactor / relay switching nearby", "observable_via": ["timing-correlation"], "confidence_when_present": 0.85},
     {"symptom": "Bench supply (battery) reads clean; mains-powered installation reads noisy", "observable_via": ["test-isolation"], "confidence_when_present": 0.95}
   ],
   "probable_causes": [
     {"cause": "Two grounds (sensor and ESP32) connected at different points carry different potentials — current flows through the ground line.", "confidence": 0.7, "evidence": ["physically-verified"]},
     {"cause": "Long unshielded analog wire acts as antenna for nearby radiated EMI.", "confidence": 0.6, "evidence": ["community"]},
     {"cause": "Switching power supply on the same circuit injects high-frequency noise back into the rail.", "confidence": 0.5, "evidence": ["community"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "Single-point ground: connect every ground (sensor, ESP32, supply) to one reference node, never daisy-chain.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["physically-verified"], "preferred": true},
     {"resolution_id": "r2", "description": "Use shielded cable with the shield grounded at the ESP32 end only; twist signal + return for differential noise rejection.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]},
     {"resolution_id": "r3", "description": "Software low-pass: average 64-256 ADC samples; the high-frequency content cancels out.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]},
     {"resolution_id": "r4", "description": "If the sensor outputs digitally (I2C / SPI), prefer that interface over analog for any cable run > 20 cm.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]}
   ],
   "related_cases": [],
   "diagnostic_questions": [
     "Is the sensor reading clean when the ESP32 runs from a battery?",
     "Are sensor and ESP32 grounds connected at one point or several?",
     "What is the cable length and is it shielded?"
   ]
 }'::jsonb,
 '1.0', '2024-07-02', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0),

-- ── 30. BLE-Mesh provisioning fails ────────────────────────────────────────
('esp32-ble-mesh-provisioning-fails', NULL, 'esp32',
 'Provisioner cannot complete BLE-Mesh provisioning of an unprovisioned device',
 'moderate',
 '{
   "symptoms": [
     {"symptom": "Provisioner sees beacon but invitation times out", "observable_via": ["serial-output"], "confidence_when_present": 0.9},
     {"symptom": "OOB authentication step always fails", "observable_via": ["serial-output"], "confidence_when_present": 0.7},
     {"symptom": "Device successfully provisions once, then refuses subsequent re-provisioning", "observable_via": ["test-isolation"], "confidence_when_present": 0.85}
   ],
   "probable_causes": [
     {"cause": "Provisioning data persisted in NVS from a previous session; node reports as already provisioned.", "confidence": 0.8, "evidence": ["espressif-esp-ble-mesh-docs"]},
     {"cause": "OOB info / authentication mismatch between provisioner expectation and device configuration.", "confidence": 0.6, "evidence": ["community"]},
     {"cause": "BLE coexistence with Wi-Fi is enabled but the configured time-share is too aggressive — provisioning packets dropped.", "confidence": 0.4, "evidence": ["community"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "Erase the mesh NVS partition (esp_ble_mesh_node_local_reset()) before re-provisioning.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"], "preferred": true},
     {"resolution_id": "r2", "description": "Match OOB capabilities exactly between provisioner and device. The simplest setup is no-OOB authentication during development.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"]},
     {"resolution_id": "r3", "description": "Disable Wi-Fi during provisioning; re-enable after the node has joined the mesh.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]}
   ],
   "related_cases": ["esp32-ble-pairing-fails-after-power-cycle"],
   "diagnostic_questions": [
     "Has this device been provisioned before? Was the mesh NVS erased?",
     "What OOB authentication method is configured on each side?",
     "Is Wi-Fi active during the provisioning attempt?"
   ]
 }'::jsonb,
 '1.0', '2024-08-15', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0)

ON CONFLICT (case_id) DO NOTHING;

-- Auto-link these new cases to the seeded ESP32-WROOM-32E HKP, matching the
-- pattern used by migration 135. Future HKPs for other variants can rewrite
-- specific case_id rows.

UPDATE diagnostic_cases
SET hkp_id = 'hkp-esp32-wroom-32e-v1', last_updated = NOW()
WHERE family_id = 'esp32' AND hkp_id IS NULL;

-- Cross-reference some of the new cases for richer "see also" relationships.

INSERT INTO diagnostic_case_cross_references
  (primary_case_id, related_case_id, relationship_type) VALUES
  ('esp32-secure-boot-key-burn-bricked', 'esp32-flash-encryption-mismatch', 'shared-root-cause'),
  ('esp32-flash-encryption-mismatch', 'esp32-secure-boot-key-burn-bricked', 'shared-root-cause'),
  ('esp32-mqtt-disconnect-keepalive', 'esp32-wifi-disconnect-60s-cycle', 'similar-symptoms'),
  ('esp32-spi-flash-corruption-after-reset', 'esp32-brownout-bad-usb-power', 'shared-root-cause'),
  ('esp32-deep-sleep-rtc-memory-loss', 'esp32-deep-sleep-wake-failure', 'similar-symptoms'),
  ('esp32-ble-mesh-provisioning-fails', 'esp32-ble-pairing-fails-after-power-cycle', 'similar-symptoms'),
  ('esp32-camera-init-or-image-corrupt', 'esp32-psram-access-crash', 'shared-root-cause'),
  ('esp32-thermal-throttle-or-shutdown', 'esp32-counterfeit-or-misidentified-module', 'shared-root-cause')
ON CONFLICT (primary_case_id, related_case_id, relationship_type) DO NOTHING;
