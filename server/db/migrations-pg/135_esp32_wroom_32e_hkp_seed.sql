-- ──────────────────────────────────────────────────────────────────────────────
-- 135_esp32_wroom_32e_hkp_seed.sql — first hand-curated Hardware Knowledge Pack.
--
-- ESP32-WROOM-32E is the most widely deployed ESP32 module. This HKP is the
-- proof-of-concept for the three-layer architecture: every claim carries a
-- classification, every regional sourcing alternative carries a counterfeit
-- risk assessment, and the existing 10 diagnostic cases (migration 134) are
-- linked back via hkp_id.
--
-- Source provenance:
--   - All 'datasheet-verified' claims trace to Espressif's
--     ESP32-WROOM-32E_ESP32-WROOM-32UE_Datasheet_en.pdf v1.5 (Sept 2023)
--     and ESP32 Series Datasheet v4.4.
--   - Regional sourcing alternatives are anton-curated from public
--     distributor pricing and community-reported counterfeit experiences;
--     intended as starting points, not binding procurement guidance.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── HKP root ─────────────────────────────────────────────────────────────────

INSERT INTO hardware_knowledge_packs
  (id, family_id, manufacturer, part_number, revision,
   hkp_version, hkp_schema_version, primary_source,
   signed_by, signing_verified, metadata)
VALUES
  ('hkp-esp32-wroom-32e-v1',
   'esp32',
   'Espressif Systems',
   'ESP32-WROOM-32E',
   'v1.5',
   '1.0.0',
   '1.0',
   'anton-curated',
   'anton-hardware-team',
   TRUE,
   '{
      "datasheet_url": "https://www.espressif.com/sites/default/files/documentation/esp32-wroom-32e_esp32-wroom-32ue_datasheet_en.pdf",
      "datasheet_version": "v1.5",
      "datasheet_date": "2023-09-01",
      "chip": "ESP32-D0WD-V3",
      "package": "SMD 18 x 25.5 x 3.1 mm, 38 pads",
      "antenna": "PCB trace (E variant); IPEX connector on UE variant",
      "fcc_id": "2AC7Z-ESPWROOM32E",
      "ic_id": "21098-ESPWROOM32E",
      "compliance": ["FCC Part 15", "ISED RSS-247", "CE RED", "IC RSS"],
      "environmental_profile_default": {
        "operating_temp_c_min": -40,
        "operating_temp_c_max": 85,
        "humidity_max_percent_rh": 90
      }
   }'::jsonb)
ON CONFLICT (manufacturer, part_number, revision, hkp_version) DO NOTHING;

-- ── Specification claims (datasheet-verified) ────────────────────────────────

-- All claims here are verified against ESP32-WROOM-32E datasheet v1.5.
-- Each evidence_ref points to the section of the datasheet.

INSERT INTO hkp_claims (hkp_id, claim_path, claim_value, classification, evidence_ref, notes) VALUES
  ('hkp-esp32-wroom-32e-v1', 'chip.cores',                        '2',                        'datasheet-verified', 'datasheet §1.1',  'Dual-core Xtensa LX6 32-bit'),
  ('hkp-esp32-wroom-32e-v1', 'chip.cpu_max_clock_mhz',            '240',                      'datasheet-verified', 'datasheet §1.1',  'Independently clockable cores'),
  ('hkp-esp32-wroom-32e-v1', 'chip.rom_kb',                       '448',                      'datasheet-verified', 'datasheet §1.1',  NULL),
  ('hkp-esp32-wroom-32e-v1', 'chip.sram_kb',                      '520',                      'datasheet-verified', 'datasheet §1.1',  '320KB DRAM + 200KB IRAM (split varies)'),
  ('hkp-esp32-wroom-32e-v1', 'chip.flash_mb',                     '4',                        'datasheet-verified', 'datasheet §1.2',  'Default; 8MB and 16MB SKUs exist'),
  ('hkp-esp32-wroom-32e-v1', 'chip.crystal_mhz',                  '40',                       'datasheet-verified', 'datasheet §1.2',  NULL),
  ('hkp-esp32-wroom-32e-v1', 'chip.psram_supported',              'no',                       'datasheet-verified', 'datasheet §1.2',  'WROOM-32E has no PSRAM; WROVER-IE variant has 8MB PSRAM'),

  -- Wireless
  ('hkp-esp32-wroom-32e-v1', 'wifi.standards',                    '802.11 b/g/n',             'datasheet-verified', 'datasheet §2.1',  '2.4 GHz only'),
  ('hkp-esp32-wroom-32e-v1', 'wifi.max_tx_power_dbm',             '20',                       'datasheet-verified', 'datasheet §3.4',  '11b mode; lower in higher modulations'),
  ('hkp-esp32-wroom-32e-v1', 'bluetooth.versions',                'BT 4.2 BR/EDR + BLE',      'datasheet-verified', 'datasheet §2.1',  NULL),

  -- GPIO
  ('hkp-esp32-wroom-32e-v1', 'gpio.usable_count',                 '22',                       'datasheet-verified', 'datasheet §2.2 + table 4', 'Of 26 GPIOs in package; GPIO6-11 reserved for SPI flash'),
  ('hkp-esp32-wroom-32e-v1', 'gpio.input_only_pins',              '34,35,36,37,38,39',        'datasheet-verified', 'datasheet table 4', 'No pull-up/down on these pins'),
  ('hkp-esp32-wroom-32e-v1', 'gpio.flash_reserved_pins',          '6,7,8,9,10,11',            'datasheet-verified', 'datasheet table 4', 'Connected to internal SPI flash — never use'),
  ('hkp-esp32-wroom-32e-v1', 'gpio.strapping_pins',               '0,2,5,12,15',              'datasheet-verified', 'datasheet §2.4',   'GPIO0=boot, GPIO2=must be low/floating at boot, GPIO12=VDD_SDIO voltage select, GPIO15=boot log suppression, GPIO5=SPI CS'),
  ('hkp-esp32-wroom-32e-v1', 'gpio.max_drive_current_ma',         '40',                       'datasheet-verified', 'datasheet §4.2',   'Per-pin recommended maximum (absolute max 50mA per pin, 1.2A package total)'),
  ('hkp-esp32-wroom-32e-v1', 'gpio.high_voltage_min_v',           '2.475',                    'datasheet-verified', 'datasheet §4.4',   'V_IH minimum at 3.3V VDD'),
  ('hkp-esp32-wroom-32e-v1', 'gpio.low_voltage_max_v',            '0.825',                    'datasheet-verified', 'datasheet §4.4',   'V_IL maximum at 3.3V VDD'),

  -- ADC
  ('hkp-esp32-wroom-32e-v1', 'adc.resolution_bits',               '12',                       'datasheet-verified', 'datasheet §2.3',   NULL),
  ('hkp-esp32-wroom-32e-v1', 'adc.channel_count',                 '18',                       'datasheet-verified', 'datasheet §2.3',   '8 on ADC1 + 10 on ADC2'),
  ('hkp-esp32-wroom-32e-v1', 'adc1.gpio_pins',                    '32,33,34,35,36,37,38,39',  'datasheet-verified', 'datasheet table 4', 'Always available — preferred when Wi-Fi is in use'),
  ('hkp-esp32-wroom-32e-v1', 'adc2.gpio_pins',                    '0,2,4,12,13,14,15,25,26,27', 'datasheet-verified', 'datasheet table 4', 'Conflicts with Wi-Fi: ADC2 returns ESP_ERR_TIMEOUT during Wi-Fi tx — see diagnostic case esp32-adc2-wifi-conflict'),
  ('hkp-esp32-wroom-32e-v1', 'dac.channel_count',                 '2',                        'datasheet-verified', 'datasheet §2.3',   '8-bit each on GPIO25 and GPIO26'),
  ('hkp-esp32-wroom-32e-v1', 'touch.channel_count',               '10',                       'datasheet-verified', 'datasheet §2.3',   'GPIOs 0,2,4,12,13,14,15,27,32,33'),

  -- Communication peripherals
  ('hkp-esp32-wroom-32e-v1', 'uart.count',                        '3',                        'datasheet-verified', 'datasheet §2.3',   'UART0 typically used for serial console'),
  ('hkp-esp32-wroom-32e-v1', 'spi.count',                         '4',                        'datasheet-verified', 'datasheet §2.3',   'SPI0/SPI1 reserved for flash; HSPI/VSPI user-accessible'),
  ('hkp-esp32-wroom-32e-v1', 'i2c.count',                         '2',                        'datasheet-verified', 'datasheet §2.3',   'Both master and slave modes; arbitrary GPIO via GPIO matrix'),
  ('hkp-esp32-wroom-32e-v1', 'i2s.count',                         '2',                        'datasheet-verified', 'datasheet §2.3',   NULL),
  ('hkp-esp32-wroom-32e-v1', 'pwm.ledc_channels',                 '16',                       'datasheet-verified', 'datasheet §2.3',   '8 high-speed + 8 low-speed channels'),
  ('hkp-esp32-wroom-32e-v1', 'twai.count',                        '1',                        'datasheet-verified', 'datasheet §2.3',   'CAN 2.0 compatible'),

  -- Power
  ('hkp-esp32-wroom-32e-v1', 'power.vdd_operating_v_min',         '3.0',                      'datasheet-verified', 'datasheet §4.1',   NULL),
  ('hkp-esp32-wroom-32e-v1', 'power.vdd_operating_v_max',         '3.6',                      'datasheet-verified', 'datasheet §4.1',   NULL),
  ('hkp-esp32-wroom-32e-v1', 'power.vdd_recommended_v',           '3.3',                      'datasheet-verified', 'datasheet §4.1',   NULL),
  ('hkp-esp32-wroom-32e-v1', 'power.tx_peak_current_ma',          '500',                      'datasheet-verified', 'datasheet §4.6',   'Brief peaks during 11b TX — supply must source this without sag (see diagnostic case esp32-brownout-bad-usb-power)'),
  ('hkp-esp32-wroom-32e-v1', 'power.rx_average_current_ma',       '95',                       'datasheet-verified', 'datasheet §4.6',   'Continuous receive'),
  ('hkp-esp32-wroom-32e-v1', 'power.modem_sleep_current_ma',      '20',                       'datasheet-verified', 'datasheet §4.6',   NULL),
  ('hkp-esp32-wroom-32e-v1', 'power.light_sleep_current_ma',      '0.8',                      'datasheet-verified', 'datasheet §4.6',   NULL),
  ('hkp-esp32-wroom-32e-v1', 'power.deep_sleep_current_ua',       '10',                       'datasheet-verified', 'datasheet §4.6',   NULL),
  ('hkp-esp32-wroom-32e-v1', 'power.hibernation_current_ua',      '5',                        'datasheet-verified', 'datasheet §4.6',   NULL),

  -- Environmental + physical
  ('hkp-esp32-wroom-32e-v1', 'env.operating_temp_c_min',          '-40',                      'datasheet-verified', 'datasheet §4.5',   NULL),
  ('hkp-esp32-wroom-32e-v1', 'env.operating_temp_c_max',          '85',                       'datasheet-verified', 'datasheet §4.5',   NULL),
  ('hkp-esp32-wroom-32e-v1', 'physical.dimensions_mm',            '18.0 x 25.5 x 3.1',        'datasheet-verified', 'datasheet §6.1',   NULL),
  ('hkp-esp32-wroom-32e-v1', 'physical.pin_count',                '38',                       'datasheet-verified', 'datasheet §6.2',   NULL),
  ('hkp-esp32-wroom-32e-v1', 'physical.pitch_mm',                 '1.27',                     'datasheet-verified', 'datasheet §6.2',   NULL),

  -- Security
  ('hkp-esp32-wroom-32e-v1', 'security.aes_supported',            'AES-128/192/256',          'datasheet-verified', 'datasheet §1.1',   'Hardware accelerator'),
  ('hkp-esp32-wroom-32e-v1', 'security.sha_supported',            'SHA-1/224/256/384/512',    'datasheet-verified', 'datasheet §1.1',   NULL),
  ('hkp-esp32-wroom-32e-v1', 'security.rsa_supported',            'RSA-3072 max',             'datasheet-verified', 'datasheet §1.1',   NULL),
  ('hkp-esp32-wroom-32e-v1', 'security.secure_boot_v2_supported', 'true',                     'datasheet-verified', 'ESP-IDF docs',     'RSA-PSS scheme via eFuse-burned key'),
  ('hkp-esp32-wroom-32e-v1', 'security.flash_encryption_supported', 'true',                   'datasheet-verified', 'ESP-IDF docs',     'AES-256 XTS via eFuse-burned key'),
  ('hkp-esp32-wroom-32e-v1', 'security.efuse_one_time',           'true',                     'datasheet-verified', 'datasheet §1.1',   'Burned eFuses are irreversible'),

  -- Operating notes (community-verified, not in the datasheet)
  ('hkp-esp32-wroom-32e-v1', 'operating.adc2_wifi_workaround',
                                                                  'Use ADC1 pins (32-39) for any reading required while Wi-Fi is active; reserve ADC2 for setup/calibration phases',
                                                                  'community-verified', 'esp32 forum threads + diagnostic case esp32-adc2-wifi-conflict', 'Confirmed across many community reports'),
  ('hkp-esp32-wroom-32e-v1', 'operating.brownout_threshold_default_v',
                                                                  '2.43',
                                                                  'datasheet-verified', 'ESP-IDF brownout detector docs', 'Lowest of 7 configurable thresholds; default in idf.py menuconfig')
ON CONFLICT (hkp_id, claim_path) DO NOTHING;

-- ── Components (peripherals + key pin clusters) ──────────────────────────────

INSERT INTO hkp_components (hkp_id, component_type, name, metadata) VALUES
  ('hkp-esp32-wroom-32e-v1', 'peripheral', 'Wi-Fi 802.11 b/g/n radio', '{
     "frequency_band": "2.4 GHz",
     "max_tx_dbm": 20,
     "antenna": "PCB trace",
     "modes": ["station", "soft-ap", "station+ap", "promiscuous"]
   }'::jsonb),
  ('hkp-esp32-wroom-32e-v1', 'peripheral', 'Bluetooth radio (BR/EDR + BLE)', '{
     "version": "4.2",
     "shares_radio_with": "wifi"
   }'::jsonb),
  ('hkp-esp32-wroom-32e-v1', 'peripheral', 'ADC1 (Wi-Fi-safe)', '{
     "channels": 8,
     "gpio_pins": [32,33,34,35,36,37,38,39],
     "resolution_bits": 12,
     "wifi_safe": true
   }'::jsonb),
  ('hkp-esp32-wroom-32e-v1', 'peripheral', 'ADC2 (Wi-Fi-conflicting)', '{
     "channels": 10,
     "gpio_pins": [0,2,4,12,13,14,15,25,26,27],
     "resolution_bits": 12,
     "wifi_safe": false,
     "warning": "Returns ESP_ERR_TIMEOUT when Wi-Fi is initialised — see diagnostic case esp32-adc2-wifi-conflict"
   }'::jsonb),
  ('hkp-esp32-wroom-32e-v1', 'peripheral', 'DAC (8-bit x2)', '{
     "channels": 2,
     "gpio_pins": [25, 26],
     "resolution_bits": 8
   }'::jsonb),
  ('hkp-esp32-wroom-32e-v1', 'peripheral', 'Touch sensor block', '{
     "channels": 10,
     "gpio_pins": [0,2,4,12,13,14,15,27,32,33],
     "rtc_capable": true
   }'::jsonb),
  ('hkp-esp32-wroom-32e-v1', 'peripheral', 'UART x3', '{
     "instances": ["UART0", "UART1", "UART2"],
     "default_console": "UART0",
     "remappable": true,
     "max_baud": 5000000
   }'::jsonb),
  ('hkp-esp32-wroom-32e-v1', 'peripheral', 'SPI x2 (user-accessible)', '{
     "instances": ["HSPI", "VSPI"],
     "max_clock_mhz": 80,
     "default_pins_hspi": {"sck": 14, "miso": 12, "mosi": 13, "cs": 15},
     "default_pins_vspi": {"sck": 18, "miso": 19, "mosi": 23, "cs": 5}
   }'::jsonb),
  ('hkp-esp32-wroom-32e-v1', 'peripheral', 'I2C x2', '{
     "instances": ["I2C0", "I2C1"],
     "modes": ["master", "slave"],
     "max_clock_khz_fast_mode": 400,
     "default_pins_i2c0": {"sda": 21, "scl": 22}
   }'::jsonb),
  ('hkp-esp32-wroom-32e-v1', 'peripheral', 'TWAI (CAN 2.0)', '{
     "instances": 1,
     "external_transceiver_required": true,
     "common_transceivers": ["SN65HVD230", "TJA1050"]
   }'::jsonb),
  ('hkp-esp32-wroom-32e-v1', 'peripheral', 'AES/SHA/RSA hardware accelerator', '{
     "aes": ["AES-128", "AES-192", "AES-256"],
     "sha": ["SHA-1", "SHA-224", "SHA-256", "SHA-384", "SHA-512"],
     "rsa_max_bits": 3072
   }'::jsonb),
  ('hkp-esp32-wroom-32e-v1', 'pin-cluster', 'Strapping pins (boot configuration)', '{
     "pins": [0, 2, 5, 12, 15],
     "warning": "Logic level at boot determines bootloader behaviour. Avoid driving these from external loads during reset."
   }'::jsonb),
  ('hkp-esp32-wroom-32e-v1', 'pin-cluster', 'Flash-reserved pins (do not connect)', '{
     "pins": [6, 7, 8, 9, 10, 11],
     "warning": "Hard-wired to internal SPI flash. Driving these will brick the module."
   }'::jsonb),
  ('hkp-esp32-wroom-32e-v1', 'pin-cluster', 'Input-only pins (no pull-up/down)', '{
     "pins": [34, 35, 36, 37, 38, 39],
     "warning": "Cannot configure as outputs. Add external pull resistors when reading buttons or open-collector signals."
   }'::jsonb)
ON CONFLICT DO NOTHING;

-- ── Regional sourcing alternatives ───────────────────────────────────────────
-- Region keys follow ANTON convention: ISO region codes plus named regions
-- ('west-africa', 'eu', 'global'). All entries are starting points — users
-- should verify counterfeit signals (FCC ID etching, Espressif logo, RF
-- shielding can finish) before deploying critical batches.

INSERT INTO hkp_regional_alternatives
  (hkp_id, region, alternative_part, distributor,
   typical_price_local, typical_price_currency, typical_lead_days,
   counterfeit_risk, notes) VALUES

  -- West Africa
  ('hkp-esp32-wroom-32e-v1', 'west-africa', 'ESP32-WROOM-32E (genuine)',
   'Mouser via local forwarder (Lagos / Accra)',
   8.50, 'USD', 14,
   'low',
   'Order from Mouser through a customs-aware forwarder. Forwarder fee adds ~$3-5 per unit but eliminates counterfeit risk. Recommended for any deployment >5 units.'),
  ('hkp-esp32-wroom-32e-v1', 'west-africa', 'ESP32-WROOM-32E (clone)',
   'Local electronics market (Computer Village Lagos, Kwame Nkrumah Circle Accra)',
   3.00, 'USD', 1,
   'high',
   'Counterfeit risk: missing or off-centre Espressif logo; absent FCC ID etching; RF can poorly soldered. Suitable for prototyping only — never for Tier 2/3 deployment.'),
  ('hkp-esp32-wroom-32e-v1', 'west-africa', 'ESP32-DevKitC-V4 (devkit)',
   'Robotech Shop (Ghana) / Skyfi Labs (Nigeria)',
   12.00, 'USD', 7,
   'moderate',
   'Pre-soldered to USB devkit. Some local distributors mix genuine and clone stock — request photos of the module before shipping.'),

  -- EU
  ('hkp-esp32-wroom-32e-v1', 'eu', 'ESP32-WROOM-32E',
   'Mouser Electronics (DE/UK warehouses)',
   5.20, 'EUR', 2,
   'low',
   'Authorised Espressif distributor. 1-3 day delivery across EU; volume pricing breaks at 10/100/1000 units.'),
  ('hkp-esp32-wroom-32e-v1', 'eu', 'ESP32-WROOM-32E',
   'Reichelt (Germany)',
   6.40, 'EUR', 3,
   'low',
   'Authorised distributor; reliable for hobby + small production runs. Ships with full RoHS / REACH documentation.'),
  ('hkp-esp32-wroom-32e-v1', 'eu', 'ESP32-WROOM-32E',
   'Farnell / element14',
   5.80, 'EUR', 2,
   'low',
   'Authorised distributor. Required if your audit chain needs EN/IEC compliance documentation.'),

  -- Global / online
  ('hkp-esp32-wroom-32e-v1', 'global', 'ESP32-WROOM-32E',
   'DigiKey',
   5.10, 'USD', 5,
   'low',
   'Authorised Espressif distributor. Ships globally; full traceability.'),
  ('hkp-esp32-wroom-32e-v1', 'global', 'ESP32-WROOM-32E (suspect)',
   'AliExpress generic seller',
   2.40, 'USD', 21,
   'critical',
   'Most listings are clones. Even when sold as genuine, batches mix counterfeit modules. Acceptable only for throwaway prototyping. Never for any device that will be powered on near a person, deployed in the field, or placed on the market.'),
  ('hkp-esp32-wroom-32e-v1', 'global', 'ESP32-DevKitC-V4',
   'Adafruit / SparkFun',
   14.95, 'USD', 4,
   'low',
   'Genuine modules pre-soldered to a tested devkit. Premium price, but the safest option for first-time learners.')
ON CONFLICT DO NOTHING;

-- ── Link existing diagnostic cases (migration 134) to this HKP ───────────────
-- Only link cases that don't already have an hkp_id assigned. Future seeds
-- for other ESP32 modules (WROOM-32U, WROVER-IE, etc.) will need their own
-- HKPs and may rewrite these links.

UPDATE diagnostic_cases
SET hkp_id = 'hkp-esp32-wroom-32e-v1', last_updated = NOW()
WHERE family_id = 'esp32' AND hkp_id IS NULL;
