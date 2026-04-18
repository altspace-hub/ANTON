-- ──────────────────────────────────────────────────────────────────────────────
-- 143_esp32_seed_templates.sql — 6 ANTON-curated ESP32 starter templates.
--
-- Each template pre-populates Phase 0 + Phase 1 fields + sensible posture so a
-- user can go straight from "New project from template" to architecture +
-- firmware. All authoritative=TRUE because they are seed content from the
-- ANTON Hardware Build team.
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO hw_templates
  (id, family_id, hkp_id, path, recommended_tier, title,
   short_description, long_description,
   project_blueprint, phase_seed_data, recommended_gates,
   starter_system_prompt,
   authoritative, signed_by, signing_verified, schema_version, tags)
VALUES

-- ── 1. Wi-Fi sensor → MQTT ──────────────────────────────────────────────────
('esp32-wifi-sensor-mqtt', 'esp32', 'hkp-esp32-wroom-32e-v1', 'develop', 1,
 'Wi-Fi Sensor → MQTT',
 'Read a sensor every N seconds, publish to an MQTT broker, deep-sleep between reads.',
 'Battery-friendly Wi-Fi sensor sketch. Default sensor: BME280 over I2C (temperature + humidity + pressure). Wakes from deep sleep on a timer, connects to Wi-Fi, publishes to a configured MQTT broker, returns to deep sleep. Demonstrates the right ADC1 vs ADC2 choice (ADC1 only — Wi-Fi is on), correct partition table for OTA, and Last Will + Testament for clean disconnect detection.',
 '{
   "offline_first": false,
   "safety_critical": false,
   "medical_adjacent": false,
   "metadata": {
     "posture": {
       "esp_idf_version": "v5.1.2",
       "enabled_components": {"wifi": {"sta": true}, "ota": true, "mqtt": true},
       "exposed_surfaces": {"wifi_station": true}
     }
   }
 }'::jsonb,
 '{
   "requirements": {
     "intended_use": "Measure ambient temperature, humidity, and pressure once per N minutes and report to MQTT.",
     "deployment": "Indoor / sheltered outdoor. Single device or small fleet.",
     "environment": {"temp_min_c": -10, "temp_max_c": 50, "ip_rating": "IP54 if outdoor"},
     "power": {"source": "battery", "battery_target_months": 12},
     "sensing": {"primary": "BME280 over I2C @ 0x76", "accuracy_temp_c": 0.5}
   },
   "architecture": {
     "peripheral_assignment": {
       "I2C0_SDA": "GPIO21",
       "I2C0_SCL": "GPIO22",
       "wake_button": "GPIO33 (RTC GPIO, ADC1-safe)"
     },
     "sleep_mode": "deep-sleep with timer wake",
     "wifi_mode": "station",
     "partition_table": "default with OTA"
   }
 }'::jsonb,
 '["platformio-build","clang-tidy","cyclonedx-sbom","cve-scan","wokwi-sim","security-scorecard"]'::jsonb,
 'You are helping a user build a battery-powered Wi-Fi sensor. Recommend MQTT QoS 1 with persistent session for delivery guarantees during weak Wi-Fi. Push back on any code that does ADC reads from ADC2 channels — Wi-Fi is on. Default to NTP-synced timestamps; the device cannot be assumed to have an RTC.',
 TRUE, 'anton-hardware-team', TRUE, '1.0',
 '["wifi","mqtt","sensor","battery","deep-sleep","starter"]'::jsonb),

-- ── 2. BLE-provisioned battery monitor ──────────────────────────────────────
('esp32-ble-battery-monitor', 'esp32', 'hkp-esp32-wroom-32e-v1', 'develop', 1,
 'BLE-Provisioned Battery Monitor',
 'Battery voltage + current monitoring. Provisioned over BLE (no hardcoded credentials). Notifies via BLE GATT.',
 'Local-only battery monitor — no Wi-Fi, no cloud. Reads battery voltage via voltage divider on ADC1 (Wi-Fi-safe channel). Shunt-resistor current via INA219 over I2C. Provisioned over BLE GATT (custom service); subsequent connections expose voltage + current + state-of-charge characteristics. Best for stand-alone battery installations where central network access is impractical or undesirable.',
 '{
   "offline_first": true,
   "safety_critical": false,
   "medical_adjacent": false,
   "metadata": {
     "posture": {
       "esp_idf_version": "v5.1.2",
       "enabled_components": {"wifi": {}, "ble": {"gatt": true, "provisioning": true}, "ota": false},
       "exposed_surfaces": {"ble_advertising": true}
     }
   }
 }'::jsonb,
 '{
   "requirements": {
     "intended_use": "Monitor battery voltage + current of an off-grid system; expose readings via BLE.",
     "power": {"source": "from monitored battery (≤2 mA average)"},
     "sensing": {"voltage": "ADC1 GPIO34 via 1:11 divider", "current": "INA219 over I2C"}
   },
   "architecture": {
     "peripheral_assignment": {
       "battery_voltage_adc": "GPIO34 (ADC1 ch6, input-only — external 10k pull required)",
       "I2C0_SDA": "GPIO21",
       "I2C0_SCL": "GPIO22"
     },
     "ble_service_uuid": "[choose 16-bit UUID from your reserved range]",
     "characteristics": ["voltage_mV", "current_mA", "soc_percent"]
   }
 }'::jsonb,
 '["platformio-build","clang-tidy","cyclonedx-sbom","cve-scan","wokwi-sim"]'::jsonb,
 'You are helping a user build an off-grid battery monitor. Wi-Fi must remain disabled (saves significant power + simplifies regulatory). Push back on any attempt to add cloud connectivity without confirming the user wants to escalate to Tier 2/3.',
 TRUE, 'anton-hardware-team', TRUE, '1.0',
 '["ble","battery","off-grid","sensor","starter"]'::jsonb),

-- ── 3. ESP32-CAM HTTP streamer ──────────────────────────────────────────────
('esp32-cam-http-streamer', 'esp32', 'hkp-esp32-wroom-32e-v1', 'develop', 1,
 'ESP32-CAM HTTP Streamer',
 'AI-Thinker ESP32-CAM serving an MJPEG stream over HTTP. PSRAM enabled. Frame-rate-honest config.',
 'Bring up an ESP32-CAM (AI-Thinker variant) as an MJPEG streamer accessible over local Wi-Fi. PSRAM mandatory for any frame size above QQVGA — the template configures the build correctly. Includes the camera_config_t pin map for the AI-Thinker board specifically (DO NOT use this template for ESP-EYE or M5 — different pins). Adds a sensible default of 5 fps at SVGA, with explicit warnings about WAN exposure being out of scope (Tier 1 only).',
 '{
   "offline_first": false,
   "safety_critical": false,
   "medical_adjacent": false,
   "metadata": {
     "posture": {
       "esp_idf_version": "v5.1.2",
       "enabled_components": {"wifi": {"sta": true}, "psram": true, "http_server": true},
       "exposed_surfaces": {"wifi_station": true}
     },
     "board_variant": "ai-thinker-esp32-cam"
   }
 }'::jsonb,
 '{
   "requirements": {
     "intended_use": "Local-network MJPEG camera for monitoring (not for security/alarm).",
     "network": "Local LAN only — explicit Tier 1 acknowledgement required for any external exposure.",
     "image": {"resolution": "SVGA (800x600)", "framerate_fps": 5}
   },
   "architecture": {
     "peripheral_assignment": "(see ai-thinker-esp32-cam camera_config_t — do NOT mix pinmaps from other boards)",
     "psram_required": true,
     "frame_buffers": 2
   }
 }'::jsonb,
 '["platformio-build","clang-tidy","cyclonedx-sbom","cve-scan"]'::jsonb,
 'You are helping a user bring up an ESP32-CAM. The single most common bug is a wrong-board pin map. Verify the user has the AI-Thinker variant before producing any code. PSRAM must be enabled — refuse to advise on frame sizes above QQVGA without confirming.',
 TRUE, 'anton-hardware-team', TRUE, '1.0',
 '["camera","mjpeg","wifi","psram","starter"]'::jsonb),

-- ── 4. Deep-sleep + LoRa ───────────────────────────────────────────────────
('esp32-deep-sleep-lora', 'esp32', 'hkp-esp32-wroom-32e-v1', 'develop', 1,
 'Deep-Sleep + LoRa Transmitter',
 'Long-life remote sensor reporting over LoRa. Deep sleep between transmissions; targets 2+ years on 2× AA.',
 'Off-grid remote sensor that wakes on a timer, reads a sensor over I2C, transmits a packet over a SX1276/SX1278 LoRa module via SPI, returns to deep sleep. Wi-Fi + BT permanently disabled to save power. Uses RTC GPIOs for wake; pulls configured before sleep to prevent floating wake. Default duty cycle 1 transmission per 15 minutes; battery model assumes 2× AA NiMH (2500 mAh).',
 '{
   "offline_first": true,
   "safety_critical": false,
   "medical_adjacent": false,
   "metadata": {
     "posture": {
       "esp_idf_version": "v5.1.2",
       "enabled_components": {"wifi": {}, "ble": {}, "ota": false},
       "exposed_surfaces": {}
     },
     "external_modules": ["sx1276-lora"]
   }
 }'::jsonb,
 '{
   "requirements": {
     "intended_use": "Off-grid remote telemetry. Reports once per 15 minutes via LoRa.",
     "power": {"source": "2x AA NiMH 2500 mAh", "battery_target_months": 24}
   },
   "architecture": {
     "peripheral_assignment": {
       "lora_sck": "GPIO18",
       "lora_miso": "GPIO19",
       "lora_mosi": "GPIO23",
       "lora_cs": "GPIO5",
       "lora_reset": "GPIO14",
       "lora_dio0": "GPIO26 (RTC GPIO, can wake from deep sleep on RX)",
       "wake_timer_seconds": 900
     },
     "sleep_strategy": "esp_deep_sleep_start with timer wake; pull-down on DIO0 before sleep",
     "wifi_disabled": true,
     "bluetooth_disabled": true
   }
 }'::jsonb,
 '["platformio-build","clang-tidy","cyclonedx-sbom","cve-scan"]'::jsonb,
 'You are helping a user build a battery-powered LoRa sensor. Wi-Fi + BT must be permanently off. Push back on any hardcoded LoRa frequency without confirming the user''s region (EU868 vs US915 vs AS923 — wrong frequency = illegal). Recommend RTC_DATA_ATTR persistence for sequence number across deep-sleep cycles.',
 TRUE, 'anton-hardware-team', TRUE, '1.0',
 '["lora","off-grid","battery","deep-sleep","starter"]'::jsonb),

-- ── 5. Secure-OTA-from-day-one ─────────────────────────────────────────────
('esp32-secure-ota-day-one', 'esp32', 'hkp-esp32-wroom-32e-v1', 'develop', 2,
 'Secure OTA from Day One',
 'Tier 2 starter with Secure Boot V2 + flash encryption + signed OTA wired in BEFORE first flash. No retrofit pain.',
 'Tier 2 internal-use template that gets the secure-update chain right from day one. Includes an explicit pre-flash checklist (eFuse verification, signing key escrow), the partition table for verified-boot rollback protection, and a documented OTA signing pipeline. The build refuses to flash plain-text once flash encryption eFuses are burned. Pairs with the patch-planner for the rollout side. Explicitly NOT for hobby use — eFuses are one-time programmable; mistakes brick modules.',
 '{
   "offline_first": false,
   "safety_critical": false,
   "medical_adjacent": false,
   "metadata": {
     "posture": {
       "esp_idf_version": "v5.1.2",
       "enabled_components": {"wifi": {"sta": true}, "ota": true, "secure_boot_v2": true, "flash_encryption": true},
       "exposed_surfaces": {"wifi_station": true}
     }
   }
 }'::jsonb,
 '{
   "requirements": {
     "intended_use": "Tier 2 internal-use device requiring authenticated firmware updates.",
     "security": {
       "secure_boot_v2": "required",
       "flash_encryption": "required (release mode)",
       "signed_ota": "required",
       "anti_rollback": "required"
     }
   },
   "architecture": {
     "partition_table": "ota with anti-rollback enabled (set CONFIG_BOOTLOADER_APP_ANTI_ROLLBACK=y)",
     "key_management": "RSA-3072 signing key in HSM or hardware-protected storage; never in repo",
     "pre_burn_checklist": [
       "Verify chip is genuine via espefuse.py summary",
       "Dry-run flash signed image first",
       "Document signing key escrow before burn",
       "Backup chip eFuse state pre-burn (irreversible)"
     ]
   }
 }'::jsonb,
 '["platformio-build","clang-tidy","cyclonedx-sbom","cve-scan","security-scorecard"]'::jsonb,
 'You are helping a user enable Secure Boot V2 + flash encryption on ESP32. eFuses are one-time-programmable; a single mistake bricks the chip. Refuse to advise on burning eFuses without explicit confirmation that: (1) the user has tested the signed image flow on a separate sacrificial module, (2) the signing key is escrowed in hardware-protected storage, (3) the user understands no rollback is possible. Reference diagnostic case esp32-secure-boot-key-burn-bricked.',
 TRUE, 'anton-hardware-team', TRUE, '1.0',
 '["secure-boot","flash-encryption","ota","tier-2","starter"]'::jsonb),

-- ── 6. WS2812 / NeoPixel controller ────────────────────────────────────────
('esp32-ws2812-controller', 'esp32', 'hkp-esp32-wroom-32e-v1', 'develop', 1,
 'WS2812 Controller (with level shifter)',
 'Drive a WS2812B NeoPixel strip from ESP32 with the right level shifter + voltage injection plan.',
 'Drive WS2812B addressable LEDs from the ESP32 with the gotchas pre-solved: 5V data-line level shifter (74AHCT125), voltage injection every 1-2 m of strip to prevent colour drift, RMT-driven timing for tight pixel control. Includes a small JSON HTTP API for animation patterns. Demonstrates ws2812 first-pixel corruption avoidance and explicit per-channel power budgeting.',
 '{
   "offline_first": false,
   "safety_critical": false,
   "medical_adjacent": false,
   "metadata": {
     "posture": {
       "esp_idf_version": "v5.1.2",
       "enabled_components": {"wifi": {"sta": true}, "http_server": true},
       "exposed_surfaces": {"wifi_station": true}
     }
   }
 }'::jsonb,
 '{
   "requirements": {
     "intended_use": "Decorative or signalling RGB strip controller, indoor or sheltered outdoor.",
     "power": {"led_count": 60, "amps_per_led_full_white": 0.06, "total_amps_worst_case": 3.6, "supply_recommendation": "5V 5A for 60 LEDs at full white"}
   },
   "architecture": {
     "peripheral_assignment": {
       "led_data_pin": "GPIO5 (drive into 74AHCT125 level shifter input, output to strip)",
       "level_shifter": "74AHCT125 — required because ESP32 is 3.3V and WS2812B expects 5V data"
     },
     "rmt_channel": "RMT0 with 1 µs ticks for accurate WS2812 timing",
     "voltage_injection": "every 1-2 m for strips longer than 60 LEDs"
   }
 }'::jsonb,
 '["platformio-build","clang-tidy","cyclonedx-sbom","cve-scan"]'::jsonb,
 'You are helping a user drive WS2812B LEDs from an ESP32. The single most common gotcha is omitting the level shifter — ESP32 is 3.3V GPIO; WS2812B expects 5V data. Refuse to recommend any direct GPIO → strip wiring. Reference diagnostic case esp32-ws2812-led-flicker-or-wrong-color.',
 TRUE, 'anton-hardware-team', TRUE, '1.0',
 '["leds","ws2812","neopixel","wifi","starter"]'::jsonb)

ON CONFLICT (id) DO NOTHING;
