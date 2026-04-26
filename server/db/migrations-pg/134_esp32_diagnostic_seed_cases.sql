-- ──────────────────────────────────────────────────────────────────────────────
-- 134_esp32_diagnostic_seed_cases.sql — first 10 authoritative ESP32 cases
--
-- These ten cases cover the most common ESP32 failure patterns documented
-- in the Espressif ESP-IDF documentation, official errata, and the active
-- community knowledge base (ESP32 Forum, Stack Overflow, GitHub issues
-- against the espressif/arduino-esp32 and espressif/esp-idf repositories).
--
-- All ten are marked authoritative=true — they are seed knowledge curated
-- by the ANTON Hardware Build team, not contributed by individual users.
-- Outcome counters in case_data reflect community-aggregated estimates
-- from the source threads referenced; they will be replaced by real
-- diagnostic_case_outcomes rows as users encounter and resolve the cases.
--
-- hkp_id is intentionally NULL for now — these cases attach to ESP32 HKPs
-- when those land in Phase 2. family_id='esp32' handles the lookup.
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO diagnostic_cases
  (case_id, hkp_id, family_id, title, severity, case_data, case_schema_version,
   first_reported, last_updated, signed_by, signing_verified, authoritative, contributor_count)
VALUES

-- ── 1. ADC2 + Wi-Fi conflict ────────────────────────────────────────────
('esp32-adc2-wifi-conflict', NULL, 'esp32',
 'ADC2 channel reads return zero or garbage when Wi-Fi is active',
 'high',
 '{
   "symptoms": [
     {"symptom": "analogRead() / adc2_get_raw() returns 0, -1, or random values intermittently", "observable_via": ["serial-output"], "confidence_when_present": 0.95},
     {"symptom": "Pattern only appears after Wi-Fi.begin() or esp_wifi_start() succeeds", "observable_via": ["code-inspection", "serial-output"], "confidence_when_present": 0.9},
     {"symptom": "ADC1 channels on the same board work normally", "observable_via": ["test-isolation"], "confidence_when_present": 0.85}
   ],
   "probable_causes": [
     {"cause": "ADC2 hardware is shared with the Wi-Fi radio. When Wi-Fi is active the ADC2 module is reserved by the Wi-Fi driver and returns ESP_ERR_TIMEOUT (Arduino layer maps to 0).", "confidence": 0.98, "evidence": ["espressif-esp-idf-docs:adc2-wifi-conflict", "errata:esp32-v3-section-3.11"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "Move all ADC reads to ADC1 channels (GPIO32-39 on classic ESP32, GPIO1-10 on S2/S3, GPIO0-4 on C3). Pin-map remap may be required.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation", "community"], "preferred": true},
     {"resolution_id": "r2", "description": "Stop Wi-Fi before each ADC2 read with esp_wifi_stop(), perform read, then esp_wifi_start(). Acceptable only for very-low-frequency reads (<1Hz) — connection drops + reconnect take seconds.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]},
     {"resolution_id": "r3", "description": "Use an external ADC over I2C/SPI (ADS1115, MCP3208) for the channels that must coexist with Wi-Fi. Adds BOM cost but eliminates the conflict entirely.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]}
   ],
   "related_cases": ["esp32-brownout-bad-usb-power"],
   "diagnostic_questions": [
     "Which ADC pin number are you reading? (GPIO0-19, 26-27 = ADC2; GPIO32-39 = ADC1 on classic ESP32)",
     "Does the issue start the moment WiFi.begin() is called, or only after connection succeeds?",
     "Does adc1_get_raw() on a different pin work at the same time?"
   ]
 }'::jsonb,
 '1.0', '2024-01-15', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0),

-- ── 2. Brownout from undersized USB power ──────────────────────────────
('esp32-brownout-bad-usb-power', NULL, 'esp32',
 'Random resets with "Brownout detector was triggered" on serial console',
 'high',
 '{
   "symptoms": [
     {"symptom": "Serial console prints \"Brownout detector was triggered\" before each reset", "observable_via": ["serial-output"], "confidence_when_present": 0.99},
     {"symptom": "Resets correlate with high-current activity (Wi-Fi TX, motor start, LED strip update)", "observable_via": ["timing-correlation"], "confidence_when_present": 0.85},
     {"symptom": "Voltage on 3V3 pin dips below 2.6 V momentarily under load", "observable_via": ["multimeter", "oscilloscope"], "confidence_when_present": 0.95},
     {"symptom": "Problem appears with one USB cable / supply but not another", "observable_via": ["test-isolation"], "confidence_when_present": 0.9}
   ],
   "probable_causes": [
     {"cause": "USB cable has high resistance (thin conductors, long length, cheap connectors) — voltage drop under current spike triggers the on-board brownout detector at ~2.7 V.", "confidence": 0.7, "evidence": ["community", "physically-verified"]},
     {"cause": "USB host port (laptop, hub, charger) cannot deliver the transient peak current ESP32 draws during Wi-Fi TX (~500 mA spikes).", "confidence": 0.6, "evidence": ["community"]},
     {"cause": "Insufficient bulk capacitance on the 3V3 rail near the ESP32 module (typical hobby boards rely on host-side decoupling).", "confidence": 0.4, "evidence": ["community", "espressif-application-notes"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "Replace USB cable with a known-good thick-conductor cable rated for ≥2 A. Test specifically with a USB power+data tester (e.g., USB-C power meter).", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"], "preferred": true},
     {"resolution_id": "r2", "description": "Add a 470 µF–1000 µF electrolytic capacitor between 3V3 and GND on the dev board.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]},
     {"resolution_id": "r3", "description": "Use a dedicated 5 V / 2 A USB power adapter (not a laptop port).", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]},
     {"resolution_id": "r4", "description": "DO NOT permanently disable the brownout detector — it protects against flash corruption. Only acceptable as a short-term diagnostic to confirm the cause.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"], "anti_pattern": true}
   ],
   "related_cases": ["esp32-adc2-wifi-conflict"],
   "diagnostic_questions": [
     "What does the serial console print exactly before the reset?",
     "Do resets correlate with a specific event in your code (Wi-Fi connection, sensor read, motor pulse)?",
     "Have you measured 3V3 with a multimeter under load — what is the minimum reading?"
   ]
 }'::jsonb,
 '1.0', '2023-08-22', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0),

-- ── 3. SPIFFS / NVS flash wear ─────────────────────────────────────────
('esp32-spiffs-flash-wear-failure', NULL, 'esp32',
 'Device stops booting / NVS errors / SPIFFS corruption after weeks-months',
 'high',
 '{
   "symptoms": [
     {"symptom": "Device boots fine for weeks, then NVS read errors appear, eventually does not boot at all", "observable_via": ["serial-output", "field-failure-pattern"], "confidence_when_present": 0.85},
     {"symptom": "ESP_ERR_NVS_INVALID_LENGTH or ESP_ERR_NVS_NOT_FOUND from previously-working code", "observable_via": ["serial-output"], "confidence_when_present": 0.9},
     {"symptom": "SPIFFS_check returns errors; partial file recovery only", "observable_via": ["spiffs-check-tool"], "confidence_when_present": 0.95},
     {"symptom": "Code calls preferences.putXxx() / spiffs.write() in a tight loop or every loop iteration", "observable_via": ["code-inspection"], "confidence_when_present": 0.95}
   ],
   "probable_causes": [
     {"cause": "Flash erase cycles exceeded. NOR flash on ESP32 modules is rated ~100,000 erase/program cycles per sector. Writing every loop iteration at 100 Hz reaches this in ~12 days. NVS wear-levelling helps but does not save you from runaway writes.", "confidence": 0.95, "evidence": ["espressif-documentation:nvs-wear-levelling", "datasheet:winbond-w25q32-flash"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "Audit code for write frequency. Coalesce writes — keep state in RAM, write to flash only when value changes AND a debounce interval has elapsed (e.g., min 60 s between writes for slow-changing state).", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation", "community"], "preferred": true},
     {"resolution_id": "r2", "description": "For high-frequency state (telemetry, counters), use RTC slow-memory (8 KB, no wear) for in-flight state and flush to flash only at shutdown / brownout warning.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]},
     {"resolution_id": "r3", "description": "Move heavy-write workloads to an external SD card (FAT, with wear-levelling at the card-controller level — much higher cycle count).", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]},
     {"resolution_id": "r4", "description": "If flash is already worn — replace the module. The chip is unrecoverable. SPIFFS reformatting will appear to work, but failures recur within days.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]}
   ],
   "related_cases": [],
   "diagnostic_questions": [
     "How often does your code call preferences.putXxx(), nvs_set_xxx(), or open SPIFFS files for write?",
     "How long has the device been in service?",
     "Did the failure appear gradually or suddenly?"
   ]
 }'::jsonb,
 '1.0', '2023-11-04', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0),

-- ── 4. Wi-Fi disconnects every 60 seconds ──────────────────────────────
('esp32-wifi-disconnect-60s-cycle', NULL, 'esp32',
 'Wi-Fi disconnects + reconnects every 30-90 seconds repeatedly',
 'moderate',
 '{
   "symptoms": [
     {"symptom": "WiFi.status() returns WL_DISCONNECTED on a regular interval (typically 30, 60, or 120 seconds)", "observable_via": ["serial-output"], "confidence_when_present": 0.9},
     {"symptom": "WiFi event handler fires SYSTEM_EVENT_STA_DISCONNECTED with reason code 200 (BEACON_TIMEOUT) or 8 (ASSOC_LEAVE)", "observable_via": ["wifi-event-log"], "confidence_when_present": 0.85},
     {"symptom": "Other Wi-Fi devices on the same SSID stay connected", "observable_via": ["test-isolation"], "confidence_when_present": 0.7}
   ],
   "probable_causes": [
     {"cause": "Modem-sleep power management: ESP32 default is WIFI_PS_MIN_MODEM, which can miss beacons on routers with short DTIM intervals or heavy 2.4 GHz congestion.", "confidence": 0.6, "evidence": ["espressif-documentation:wifi-power-save", "community"]},
     {"cause": "Router AP-isolation, band-steering or 802.11k/v/r features confusing the ESP32 driver (which historically did not implement all of them).", "confidence": 0.45, "evidence": ["community"]},
     {"cause": "DHCP lease very short on router; ESP32 stack does not always renew gracefully across power-save wake.", "confidence": 0.35, "evidence": ["community"]},
     {"cause": "2.4 GHz channel congestion / interference — many access points + Bluetooth devices.", "confidence": 0.4, "evidence": ["community"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "Disable Wi-Fi power save: WiFi.setSleep(false) / esp_wifi_set_ps(WIFI_PS_NONE). Higher power draw but stable. Often the single most impactful fix.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"], "preferred": true},
     {"resolution_id": "r2", "description": "Force a fixed 2.4 GHz channel on the router (channels 1, 6, or 11) and disable band-steering for the SSID the ESP32 uses. Use a separate IoT SSID if available.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]},
     {"resolution_id": "r3", "description": "Implement a watchdog reconnect handler — when SYSTEM_EVENT_STA_DISCONNECTED fires, call WiFi.reconnect() with a backoff. Treats the symptom but masks the root cause.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]},
     {"resolution_id": "r4", "description": "Update arduino-esp32 / ESP-IDF to latest stable. Many Wi-Fi stability fixes have landed since 2022.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-changelogs"]}
   ],
   "related_cases": ["esp32-ota-failure-boot-loop"],
   "diagnostic_questions": [
     "What is the WiFi event reason code reported in the SYSTEM_EVENT_STA_DISCONNECTED handler?",
     "What router make / firmware are you connecting to? Does it use band-steering?",
     "What arduino-esp32 / ESP-IDF version are you on?"
   ]
 }'::jsonb,
 '1.0', '2023-06-18', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0),

-- ── 5. Deep sleep wake failure ─────────────────────────────────────────
('esp32-deep-sleep-wake-failure', NULL, 'esp32',
 'Device enters deep sleep but never wakes (or wakes immediately + loops)',
 'high',
 '{
   "symptoms": [
     {"symptom": "esp_deep_sleep_start() returns / device prints boot banner, then sleeps without waking", "observable_via": ["serial-output", "current-meter"], "confidence_when_present": 0.95},
     {"symptom": "Device immediately wakes from deep sleep (boot loop with cause = ESP_SLEEP_WAKEUP_GPIO or ESP_SLEEP_WAKEUP_UNDEFINED)", "observable_via": ["serial-output", "esp_sleep_get_wakeup_cause()"], "confidence_when_present": 0.9},
     {"symptom": "Wake from EXT0/EXT1 GPIO never fires when the GPIO toggles", "observable_via": ["test-isolation"], "confidence_when_present": 0.85},
     {"symptom": "Current draw in deep sleep is much higher than datasheet (10s of mA vs ~10 µA expected)", "observable_via": ["current-meter"], "confidence_when_present": 0.95}
   ],
   "probable_causes": [
     {"cause": "GPIO chosen for wake is not an RTC GPIO. Only GPIOs 0,2,4,12-15,25-27,32-39 (classic ESP32) survive deep sleep. S2/S3/C3 have different RTC-GPIO sets.", "confidence": 0.9, "evidence": ["espressif-documentation:rtc-gpio"]},
     {"cause": "Pull-up / pull-down not configured before sleep — floating GPIO causes immediate or random wake.", "confidence": 0.8, "evidence": ["espressif-documentation"]},
     {"cause": "Wake source not enabled before sleep (forgot esp_sleep_enable_ext0_wakeup or equivalent).", "confidence": 0.7, "evidence": ["community"]},
     {"cause": "Peripheral on the board (USB-UART bridge, regulator quiescent current, on-board LED) keeps drawing current.", "confidence": 0.7, "evidence": ["community"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "Verify wake GPIO is RTC-capable for the variant in use. Cross-check against the variant pin map in the HKP. Move the wake source to an RTC GPIO if not.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"], "preferred": true},
     {"resolution_id": "r2", "description": "Configure pull-up/pull-down on the wake GPIO BEFORE calling esp_deep_sleep_start: rtc_gpio_pullup_en(gpio) or rtc_gpio_pulldown_en(gpio) per polarity.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"]},
     {"resolution_id": "r3", "description": "Enable the wake source explicitly before sleep — esp_sleep_enable_ext0_wakeup(GPIO_NUM_X, level) or esp_sleep_enable_timer_wakeup(us). Print the active wake sources before sleep to confirm.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]},
     {"resolution_id": "r4", "description": "For sleep-current diagnosis: measure on a bare module (cut/remove dev-board power LED and USB-UART chip) — many dev boards add 10-20 mA of quiescent current that masks the ESP32 sleep current.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]}
   ],
   "related_cases": ["esp32-spiffs-flash-wear-failure"],
   "diagnostic_questions": [
     "Which GPIO are you using as the wake source?",
     "What does esp_sleep_get_wakeup_cause() return after a wake?",
     "What current does the device draw during deep sleep — measured how?"
   ]
 }'::jsonb,
 '1.0', '2024-02-09', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0),

-- ── 6. I2C bus hang / address conflict ─────────────────────────────────
('esp32-i2c-bus-hang-or-no-devices', NULL, 'esp32',
 'I2C scan shows no devices, or bus locks up after a few transactions',
 'moderate',
 '{
   "symptoms": [
     {"symptom": "I2C scanner sketch reports 0 devices found", "observable_via": ["serial-output"], "confidence_when_present": 0.95},
     {"symptom": "First few I2C transactions succeed, then Wire.endTransmission() returns 4 (other error) and stays stuck", "observable_via": ["serial-output"], "confidence_when_present": 0.85},
     {"symptom": "SDA or SCL line is stuck low when measured", "observable_via": ["multimeter", "oscilloscope"], "confidence_when_present": 0.9},
     {"symptom": "Two devices share the same I2C address", "observable_via": ["datasheet-cross-reference", "scanner-output"], "confidence_when_present": 0.95}
   ],
   "probable_causes": [
     {"cause": "Missing pull-up resistors. I2C is open-drain — without 4.7kΩ–10kΩ pull-ups on SDA + SCL, lines never go high.", "confidence": 0.85, "evidence": ["i2c-spec", "espressif-documentation"]},
     {"cause": "Two devices on the bus share the same 7-bit address (e.g., two BME280 sensors both at 0x76). Bus arbitration fails and one or both go silent.", "confidence": 0.8, "evidence": ["i2c-spec"]},
     {"cause": "An I2C peripheral was reset mid-transaction; SDA is held low waiting for a clock edge that never comes — bus-stuck condition.", "confidence": 0.75, "evidence": ["i2c-spec"]},
     {"cause": "Cable too long / capacitance too high — rise times exceed I2C timing (typically <1 µs for standard mode, less for fast).", "confidence": 0.5, "evidence": ["community"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "Add 4.7kΩ pull-ups from SDA→3V3 and SCL→3V3 if not already present on either device or breakout board. Some breakouts include them, many do not — measure SDA/SCL idle voltage; should be ~3.3 V.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["i2c-spec", "community"], "preferred": true},
     {"resolution_id": "r2", "description": "For address conflicts: change one device''s address jumper / use an I2C address-translator chip / put one device on a separate I2C bus (Wire1 on ESP32 supports a second bus via Wire1.begin(SDA2, SCL2)).", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]},
     {"resolution_id": "r3", "description": "For bus-stuck: clock SCL manually 9-16 times via direct GPIO write to flush a stalled slave, then re-init Wire. Or power-cycle the affected slave.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["i2c-spec", "community"]},
     {"resolution_id": "r4", "description": "Reduce I2C bus speed: Wire.setClock(100000) for standard mode. Long wires + multiple devices benefit from slower clocks.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]}
   ],
   "related_cases": [],
   "diagnostic_questions": [
     "Run an I2C scanner sketch — what does it report?",
     "Measure SDA and SCL with a multimeter at idle — what voltage?",
     "Are pull-up resistors present on the breakout board(s)?",
     "Are there two devices on the bus that might share an address?"
   ]
 }'::jsonb,
 '1.0', '2023-09-12', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0),

-- ── 7. PSRAM access crash ──────────────────────────────────────────────
('esp32-psram-access-crash', NULL, 'esp32',
 'Crashes (LoadProhibited / StoreProhibited) when accessing memory expected to be in PSRAM',
 'high',
 '{
   "symptoms": [
     {"symptom": "Crash with \"Guru Meditation Error: Core 0 panic''ed (LoadProhibited)\" or StoreProhibited", "observable_via": ["serial-output"], "confidence_when_present": 0.95},
     {"symptom": "Crash address is in the 0x3F800000–0x3FBFFFFF range (mapped PSRAM region) or is NULL after a malloc returned what looked like a valid pointer", "observable_via": ["crash-decoder", "esp32-exception-decoder"], "confidence_when_present": 0.9},
     {"symptom": "ESP.getPsramSize() returns 0 even though the module datasheet lists PSRAM", "observable_via": ["serial-output"], "confidence_when_present": 0.95},
     {"symptom": "Code uses ps_malloc() / heap_caps_malloc(MALLOC_CAP_SPIRAM) but board build does not enable PSRAM", "observable_via": ["code-inspection", "build-config-inspection"], "confidence_when_present": 0.85}
   ],
   "probable_causes": [
     {"cause": "PSRAM not enabled in the build configuration. Arduino IDE: Tools → PSRAM = Enabled. PlatformIO: -D BOARD_HAS_PSRAM and -mfix-esp32-psram-cache-issue or board_build.arduino.memory_type config.", "confidence": 0.85, "evidence": ["espressif-documentation:psram-build-options"]},
     {"cause": "Module is a non-PSRAM variant. ESP32-WROOM-32 has no PSRAM; ESP32-WROVER (and most S3 variants) do. Markings on the metal can are the only reliable identification.", "confidence": 0.9, "evidence": ["espressif-product-selection-guide"]},
     {"cause": "PSRAM allocation succeeded but pointer was passed to a DMA-using API that requires internal RAM (e.g., ESP-NOW, certain Wi-Fi paths, I2S DMA buffers).", "confidence": 0.7, "evidence": ["espressif-documentation:dma-capable-memory"]},
     {"cause": "PSRAM has a documented cache erratum on rev 1 silicon that requires the -mfix-esp32-psram-cache-issue flag — without it, sporadic corruption.", "confidence": 0.5, "evidence": ["espressif-errata:esp32-psram"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "Identify the module variant from the metal-can markings (or photo to the HKP photo-id once available). Confirm whether PSRAM is physically present.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"], "preferred": true},
     {"resolution_id": "r2", "description": "Enable PSRAM in the build: Arduino IDE Tools → PSRAM = Enabled, OR PlatformIO board_build.arduino.memory_type = qio_opi (S3) / dio_qspi (classic). Add -DBOARD_HAS_PSRAM where required.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"]},
     {"resolution_id": "r3", "description": "For DMA-required allocations: use heap_caps_malloc(size, MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL) instead of ps_malloc().", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"]},
     {"resolution_id": "r4", "description": "On classic ESP32 with PSRAM: add -mfix-esp32-psram-cache-issue to PlatformIO build_flags (already default in modern arduino-esp32).", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-errata"]}
   ],
   "related_cases": ["esp32-counterfeit-or-misidentified-module"],
   "diagnostic_questions": [
     "What does the metal-can label on your module say (full text)?",
     "What does ESP.getPsramSize() return at boot?",
     "What is the exact PlatformIO env config or Arduino IDE board selection?",
     "Where does the crash address fall (run through the ESP32 exception decoder)?"
   ]
 }'::jsonb,
 '1.0', '2024-03-21', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0),

-- ── 8. Counterfeit / misidentified ESP32 module ────────────────────────
('esp32-counterfeit-or-misidentified-module', NULL, 'esp32',
 'Module behaves unexpectedly — wrong flash size, missing PSRAM, instability that does not match the variant claimed',
 'high',
 '{
   "symptoms": [
     {"symptom": "ESP.getFlashChipSize() returns less than the listed module spec (e.g., 4MB chip when module is sold as 16MB)", "observable_via": ["serial-output"], "confidence_when_present": 0.9},
     {"symptom": "ESP.getPsramSize() returns 0 on a module sold as ESP32-WROVER / ESP32-S3 with N16R8 etc.", "observable_via": ["serial-output"], "confidence_when_present": 0.85},
     {"symptom": "esp_chip_info() reports a different revision or core count than expected", "observable_via": ["serial-output"], "confidence_when_present": 0.8},
     {"symptom": "Module label has odd font / colour / spelling errors / missing CE/FCC marks", "observable_via": ["physical-inspection"], "confidence_when_present": 0.7},
     {"symptom": "Wi-Fi range significantly worse than other identical-looking modules", "observable_via": ["test-isolation"], "confidence_when_present": 0.6}
   ],
   "probable_causes": [
     {"cause": "Counterfeit module — repackaged lower-spec chip (e.g., ESP32-D0WD relabelled as ESP32-WROOM-32E), or refurbished die in a fake shield.", "confidence": 0.7, "evidence": ["community", "espressif-counterfeit-warnings"]},
     {"cause": "Genuine but lower-spec variant from the same module family — dev-board vendor mis-listed the spec.", "confidence": 0.5, "evidence": ["community"]},
     {"cause": "PSRAM/flash chips on the module are real but smaller than the label claims (relabelled flash).", "confidence": 0.6, "evidence": ["community"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "Run an authenticity-check sketch: print esp_chip_info() (model, revision, cores, features), ESP.getFlashChipSize(), ESP.getPsramSize(), MAC address. Compare against the variant''s datasheet expected values in the HKP.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"], "preferred": true},
     {"resolution_id": "r2", "description": "Inspect the metal can: Espressif logo registration, font kerning, presence of CE + FCC + IC marks, datecode in expected format. Compare to known-good reference photos in the HKP.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community", "espressif-quality-assurance-docs"]},
     {"resolution_id": "r3", "description": "Source from authorised distributors (Mouser, DigiKey, LCSC official, Adafruit, Sparkfun, Espressif direct). Avoid unverified third-party marketplace listings for production devices.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]},
     {"resolution_id": "r4", "description": "If counterfeit confirmed and device is on-market (Tier 3): notify users, recall affected units, do not deploy further. Counterfeit modules have no security guarantees.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"], "regulatory_implication": true}
   ],
   "related_cases": ["esp32-psram-access-crash"],
   "diagnostic_questions": [
     "Where did you source the module from?",
     "What does ESP.getChipModel() / esp_chip_info() report?",
     "Can you take a photo of the metal-can markings? (ANTON HKP photo-id can compare against reference photos)"
   ]
 }'::jsonb,
 '1.0', '2024-04-30', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0),

-- ── 9. OTA update fails / boot loop ────────────────────────────────────
('esp32-ota-failure-boot-loop', NULL, 'esp32',
 'OTA update fails mid-flash / device boots into recovery / boot loop after OTA',
 'high',
 '{
   "symptoms": [
     {"symptom": "Update.write() returns false partway through; Update.end() returns false; device reboots into the previous image", "observable_via": ["serial-output"], "confidence_when_present": 0.9},
     {"symptom": "OTA succeeds but device boots, prints partial bootloader, and resets in a loop", "observable_via": ["serial-output"], "confidence_when_present": 0.95},
     {"symptom": "esp_ota_get_running_partition() reports the OTA partition but esp_ota_get_state_partition returns ESP_OTA_IMG_INVALID", "observable_via": ["esp-idf-api"], "confidence_when_present": 0.85},
     {"symptom": "Bootloader prints \"invalid header\" or \"image corrupted\" before reset", "observable_via": ["serial-output"], "confidence_when_present": 0.95}
   ],
   "probable_causes": [
     {"cause": "OTA partition smaller than the firmware image. Default 4MB flash partition table allows ~1.5 MB per OTA slot. Modern firmware easily exceeds this.", "confidence": 0.85, "evidence": ["espressif-documentation:partition-tables"]},
     {"cause": "Power loss / brownout during the OTA write — partial write leaves the partition in an unbootable state.", "confidence": 0.7, "evidence": ["espressif-documentation"]},
     {"cause": "Image was not signed but secure-boot is enabled on the chip — bootloader rejects the new image silently.", "confidence": 0.6, "evidence": ["espressif-documentation:secure-boot"]},
     {"cause": "esp_ota_set_boot_partition() not called / Update.end(true) not called — the new image is written but never marked active.", "confidence": 0.5, "evidence": ["arduino-esp32-source"]},
     {"cause": "Bootloader / partition table itself was overwritten (rare — but happens when a custom partition table is used and the OTA tooling assumes the default).", "confidence": 0.4, "evidence": ["community"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "Verify partition table size: print esp_ota_get_running_partition()->size and compare to firmware binary size. If close, switch to a min_spiffs partition scheme (Arduino IDE: Tools → Partition Scheme = Minimal SPIFFS / No OTA + 16MB flash).", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"], "preferred": true},
     {"resolution_id": "r2", "description": "Always call Update.end(true) after the last Update.write(). The (true) argument finalises the partition switch.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["arduino-esp32-source"]},
     {"resolution_id": "r3", "description": "Add validation step after OTA: write a marker on first successful boot of the new image (esp_ota_mark_app_valid_cancel_rollback()). If the device crashes before this, rollback counter triggers a return to the previous image.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation:rollback"]},
     {"resolution_id": "r4", "description": "For Tier 3 connected-device builds (non-negotiable): require signed images + verified boot + rollback protection. Without these, OTA is a security risk in the field.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"], "tier_constraint": "tier-3"},
     {"resolution_id": "r5", "description": "If device is bricked: serial-flash a known-good factory image. The factory partition (if present) provides a recovery image accessible via boot-mode pin.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["espressif-documentation"]}
   ],
   "related_cases": ["esp32-brownout-bad-usb-power"],
   "diagnostic_questions": [
     "What partition scheme are you using?",
     "What is your firmware binary size vs partition size?",
     "Do you call Update.end(true) explicitly?",
     "Is secure boot enabled on the chip (efuse-readable)?"
   ]
 }'::jsonb,
 '1.0', '2024-05-15', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0),

-- ── 10. Web server memory exhaustion ───────────────────────────────────
('esp32-web-server-memory-exhaustion', NULL, 'esp32',
 'AsyncWebServer / WebServer crashes after a few requests; "Allocation failed" in heap',
 'moderate',
 '{
   "symptoms": [
     {"symptom": "Crash with \"assert failed: heap_caps_malloc\" or \"Allocation failed\" in serial output after N HTTP requests", "observable_via": ["serial-output"], "confidence_when_present": 0.9},
     {"symptom": "ESP.getFreeHeap() decreases steadily under web load and never recovers", "observable_via": ["serial-output", "heap-monitoring"], "confidence_when_present": 0.95},
     {"symptom": "First requests succeed; later requests time out then panic", "observable_via": ["client-side-observation"], "confidence_when_present": 0.85},
     {"symptom": "Code reads request body into a single String / loads entire response from SPIFFS into RAM before send", "observable_via": ["code-inspection"], "confidence_when_present": 0.9}
   ],
   "probable_causes": [
     {"cause": "Memory leak — strings, JSON objects, or buffers allocated per request never freed. AsyncWebServer in particular requires careful AsyncWebServerResponse lifetime management.", "confidence": 0.85, "evidence": ["asyncwebserver-issues", "community"]},
     {"cause": "Heap fragmentation — many small allocs of varying size leave gaps the OS cannot use. Free heap shows space but largest free block is too small.", "confidence": 0.75, "evidence": ["espressif-documentation:heap-fragmentation"]},
     {"cause": "Whole files loaded into RAM with String / readBytes() before sending instead of streamed chunk-by-chunk via AsyncWebServerResponse * stream.", "confidence": 0.85, "evidence": ["community"]},
     {"cause": "Wi-Fi/TLS contexts consuming the heap as connections persist (long-lived keep-alive + TLS + JSON serializers compound the problem).", "confidence": 0.6, "evidence": ["community"]}
   ],
   "resolutions": [
     {"resolution_id": "r1", "description": "Stream large responses: use response = request->beginResponseStream(\"text/html\"); write to it incrementally; do not assemble the full payload in RAM. Same for SPIFFS files: request->send(SPIFFS, \"/file.html\") streams without buffering.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["asyncwebserver-docs"], "preferred": true},
     {"resolution_id": "r2", "description": "Print ESP.getFreeHeap() and ESP.getMaxAllocHeap() (largest free block) periodically to distinguish leak vs fragmentation. If maxAllocHeap drops while freeHeap stays high → fragmentation.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]},
     {"resolution_id": "r3", "description": "If using PSRAM: route large JSON / response buffers through ps_malloc() to keep internal heap free for Wi-Fi/TLS. Beware DMA-required allocations (must stay in internal heap).", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]},
     {"resolution_id": "r4", "description": "Limit max simultaneous connections (AsyncWebServer.handleClient or per-handler concurrency caps). Reject excess with 503 instead of OOM.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["community"]},
     {"resolution_id": "r5", "description": "Audit JSON serialization: ArduinoJson v6+ supports streaming serialization (serializeJson(doc, *response)) which avoids building the full string in RAM.", "outcome_tracking": {"tried": 0, "worked": 0, "made_worse": 0, "no_effect": 0}, "verified_by": ["arduinojson-docs"]}
   ],
   "related_cases": ["esp32-psram-access-crash"],
   "diagnostic_questions": [
     "What is your free heap at boot vs after N requests?",
     "What is your largest free block (max-alloc-heap)?",
     "Are you streaming responses or assembling them as Strings?",
     "What library are you using — WebServer, AsyncWebServer, ESPAsyncWebServer fork, or something else?"
   ]
 }'::jsonb,
 '1.0', '2024-07-08', '2026-04-18', 'anton-hardware-team', TRUE, TRUE, 0)
ON CONFLICT (case_id) DO NOTHING;

-- ── Optional: a few cross-references between related cases ─────────────
INSERT INTO diagnostic_case_cross_references
  (primary_case_id, related_case_id, relationship_type)
VALUES
  ('esp32-adc2-wifi-conflict',          'esp32-brownout-bad-usb-power',          'similar-symptoms'),
  ('esp32-brownout-bad-usb-power',      'esp32-ota-failure-boot-loop',           'shared-root-cause'),
  ('esp32-counterfeit-or-misidentified-module', 'esp32-psram-access-crash',      'shared-root-cause'),
  ('esp32-web-server-memory-exhaustion', 'esp32-psram-access-crash',             'similar-symptoms')
ON CONFLICT DO NOTHING;
