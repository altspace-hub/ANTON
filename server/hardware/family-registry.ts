/**
 * family-registry.ts — single registry of all supported hardware families.
 *
 * Launch content: `esp32` only. Reserved entries (status='reserved') for
 * arduino, raspberry_pi, stm32, nrf52, rp2040 — schema complete but no
 * family-specific code yet. Adding one of those later means populating
 * the entry + implementing the FamilyImplementation interface in
 * `server/hardware/families/{family_id}/`.
 */

export interface HardwareFamily {
  id: string;
  display_name: string;
  manufacturer_context: string;

  toolchain: {
    build_system: string;
    default_ide_config: Record<string, unknown>;
    supported_frameworks: string[];
  };

  simulation: {
    primary_simulator: 'wokwi' | 'renode' | 'qemu' | 'none';
    supported_variants: string[];
    integration_module: string; // import path of the family-specific simulation module
  };

  static_analysis: {
    primary_tool: string;
    config_template_path: string;
  };

  pin_naming: {
    convention: string;
    pin_map_schema_version: string;
  };

  secure_update: {
    default_supported: boolean;
    mechanism: 'ota-signed' | 'serial-only' | 'none';
    documentation_ref: string;
  };

  hkp_support: {
    photo_identification_available: boolean;
    sheetsdata_coverage: 'full' | 'partial' | 'none';
    vendor_advisory_feeds: string[]; // URL patterns for vendor security feeds
  };

  /** Per-path enablement so paths can be rolled out gradually for a family */
  enabled_paths: {
    diagnose: boolean;
    maintain: boolean;
    develop: boolean;
  };

  known_variants: string[];

  /** Languages whose generation quality has been native-speaker-validated for this family */
  i18n_validated_languages: string[];

  status: 'launch' | 'beta' | 'reserved' | 'deprecated';
}

export const HARDWARE_FAMILIES: Record<string, HardwareFamily> = {
  // ──────────────────────────────────────────────────────────────────────────
  // ESP32 — fully populated, launch family
  // ──────────────────────────────────────────────────────────────────────────
  esp32: {
    id: 'esp32',
    display_name: 'Espressif ESP32',
    manufacturer_context: 'Espressif Systems · widely-deployed Wi-Fi+Bluetooth SoC for IoT, prototyping, and embedded applications',
    toolchain: {
      build_system: 'platformio',
      default_ide_config: {
        platform: 'espressif32',
        framework: ['arduino', 'espidf'],
        monitor_speed: 115200,
      },
      supported_frameworks: ['arduino', 'espidf'],
    },
    simulation: {
      primary_simulator: 'wokwi',
      supported_variants: ['esp32', 'esp32-s2', 'esp32-s3', 'esp32-c3', 'esp32-c6'],
      integration_module: './families/esp32/simulation',
    },
    static_analysis: {
      primary_tool: 'clang-tidy',
      config_template_path: './families/esp32/clang-tidy.yml',
    },
    pin_naming: {
      convention: 'gpio-numeric',
      pin_map_schema_version: '1.0',
    },
    secure_update: {
      default_supported: true,
      mechanism: 'ota-signed',
      documentation_ref: 'https://docs.espressif.com/projects/esp-idf/en/latest/esp32/security/secure-boot-v2.html',
    },
    hkp_support: {
      photo_identification_available: false,  // ships in Phase 5 with vision-model training
      sheetsdata_coverage: 'partial',
      vendor_advisory_feeds: [
        'https://www.espressif.com/en/support/security-advisories',
      ],
    },
    enabled_paths: {
      diagnose: true,
      maintain: true,
      develop: true,
    },
    known_variants: [
      'ESP32-WROOM-32',
      'ESP32-WROOM-32E',
      'ESP32-S2',
      'ESP32-S3',
      'ESP32-C3',
      'ESP32-C6',
      'ESP32-H2',
    ],
    i18n_validated_languages: ['en'],  // expanded in Phase 8 (humanitarian deployment kit)
    status: 'launch',
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Reserved entries — schema complete, status='reserved'
  // Populating these is post-launch extension work; see HARDWARE_BUILD_ROADMAP.md
  // and ANTON_Hardware_Build_Spec_v4.md §11 for the extension procedure.
  // ──────────────────────────────────────────────────────────────────────────

  raspberry_pi: {
    id: 'raspberry_pi',
    display_name: 'Raspberry Pi',
    manufacturer_context: 'Raspberry Pi Foundation · single-board computers (Pi 4B, Pi 5) and microcontrollers (Pico, Pico W)',
    toolchain: {
      build_system: 'raspberry-pi-pico-sdk',
      default_ide_config: {},
      supported_frameworks: ['pico-sdk', 'circuitpython', 'micropython', 'rpi-os'],
    },
    simulation: {
      primary_simulator: 'wokwi',
      supported_variants: ['rpi-pico', 'rpi-pico-w'],
      integration_module: './families/raspberry_pi/simulation',
    },
    static_analysis: {
      primary_tool: 'clang-tidy',
      config_template_path: './families/raspberry_pi/clang-tidy.yml',
    },
    pin_naming: {
      convention: 'bcm-numbering',
      pin_map_schema_version: '1.0',
    },
    secure_update: {
      default_supported: false,
      mechanism: 'serial-only',
      documentation_ref: '',
    },
    hkp_support: {
      photo_identification_available: false,
      sheetsdata_coverage: 'partial',
      vendor_advisory_feeds: [],
    },
    enabled_paths: { diagnose: false, maintain: false, develop: false },
    known_variants: ['Pi 4B', 'Pi 5', 'Pico', 'Pico W', 'Zero 2 W'],
    i18n_validated_languages: [],
    status: 'reserved',
  },

  arduino: {
    id: 'arduino',
    display_name: 'Arduino',
    manufacturer_context: 'Arduino · educational and maker-friendly microcontrollers (Uno, Mega, Nano)',
    toolchain: {
      build_system: 'arduino-ide',
      default_ide_config: {},
      supported_frameworks: ['arduino'],
    },
    simulation: {
      primary_simulator: 'wokwi',
      supported_variants: ['uno', 'mega', 'nano', 'uno-r4-wifi'],
      integration_module: './families/arduino/simulation',
    },
    static_analysis: {
      primary_tool: 'cppcheck',
      config_template_path: './families/arduino/cppcheck.cfg',
    },
    pin_naming: {
      convention: 'digital-analog-split',
      pin_map_schema_version: '1.0',
    },
    secure_update: {
      default_supported: false,
      mechanism: 'serial-only',
      documentation_ref: '',
    },
    hkp_support: {
      photo_identification_available: false,
      sheetsdata_coverage: 'partial',
      vendor_advisory_feeds: [],
    },
    enabled_paths: { diagnose: false, maintain: false, develop: false },
    known_variants: ['Uno R3', 'Uno R4', 'Mega 2560', 'Nano', 'Nano 33 IoT'],
    i18n_validated_languages: [],
    status: 'reserved',
  },

  stm32: {
    id: 'stm32',
    display_name: 'STMicroelectronics STM32',
    manufacturer_context: 'ST Microelectronics · ARM Cortex-M industrial / professional embedded',
    toolchain: {
      build_system: 'platformio',
      default_ide_config: {},
      supported_frameworks: ['stm32cube', 'arduino', 'mbed'],
    },
    simulation: {
      primary_simulator: 'renode',
      supported_variants: ['F4', 'F7', 'L4', 'H7'],
      integration_module: './families/stm32/simulation',
    },
    static_analysis: {
      primary_tool: 'clang-tidy',
      config_template_path: './families/stm32/clang-tidy.yml',
    },
    pin_naming: { convention: 'port-pin', pin_map_schema_version: '1.0' },
    secure_update: { default_supported: true, mechanism: 'ota-signed', documentation_ref: '' },
    hkp_support: { photo_identification_available: false, sheetsdata_coverage: 'partial', vendor_advisory_feeds: [] },
    enabled_paths: { diagnose: false, maintain: false, develop: false },
    known_variants: ['F407', 'F411', 'F746', 'L476', 'H743'],
    i18n_validated_languages: [],
    status: 'reserved',
  },

  nrf52: {
    id: 'nrf52',
    display_name: 'Nordic nRF52',
    manufacturer_context: 'Nordic Semiconductor · Bluetooth Low Energy / mesh / Thread / Zigbee SoCs',
    toolchain: {
      build_system: 'platformio',
      default_ide_config: {},
      supported_frameworks: ['nrf-connect-sdk', 'arduino', 'zephyr'],
    },
    simulation: {
      primary_simulator: 'renode',
      supported_variants: ['nRF52832', 'nRF52840', 'nRF5340'],
      integration_module: './families/nrf52/simulation',
    },
    static_analysis: {
      primary_tool: 'clang-tidy',
      config_template_path: './families/nrf52/clang-tidy.yml',
    },
    pin_naming: { convention: 'gpio-numeric', pin_map_schema_version: '1.0' },
    secure_update: { default_supported: true, mechanism: 'ota-signed', documentation_ref: '' },
    hkp_support: { photo_identification_available: false, sheetsdata_coverage: 'partial', vendor_advisory_feeds: [] },
    enabled_paths: { diagnose: false, maintain: false, develop: false },
    known_variants: ['nRF52832', 'nRF52833', 'nRF52840'],
    i18n_validated_languages: [],
    status: 'reserved',
  },

  rp2040: {
    id: 'rp2040',
    display_name: 'Raspberry Pi RP2040',
    manufacturer_context: 'Raspberry Pi Foundation · dual-core Cortex-M0+ microcontroller used in Pico W and many third-party boards',
    toolchain: {
      build_system: 'platformio',
      default_ide_config: {},
      supported_frameworks: ['pico-sdk', 'arduino', 'circuitpython', 'micropython'],
    },
    simulation: {
      primary_simulator: 'wokwi',
      supported_variants: ['rpi-pico', 'rpi-pico-w'],
      integration_module: './families/rp2040/simulation',
    },
    static_analysis: {
      primary_tool: 'clang-tidy',
      config_template_path: './families/rp2040/clang-tidy.yml',
    },
    pin_naming: { convention: 'gpio-numeric', pin_map_schema_version: '1.0' },
    secure_update: { default_supported: false, mechanism: 'serial-only', documentation_ref: '' },
    hkp_support: { photo_identification_available: false, sheetsdata_coverage: 'partial', vendor_advisory_feeds: [] },
    enabled_paths: { diagnose: false, maintain: false, develop: false },
    known_variants: ['Pi Pico', 'Pi Pico W', 'Adafruit Feather RP2040'],
    i18n_validated_languages: [],
    status: 'reserved',
  },
};

// ── Lookup helpers ────────────────────────────────────────────────────────

export function getFamily(id: string): HardwareFamily | undefined {
  return HARDWARE_FAMILIES[id];
}

export function listLaunchFamilies(): HardwareFamily[] {
  return Object.values(HARDWARE_FAMILIES).filter(f => f.status === 'launch');
}

export function listAllFamilies(): HardwareFamily[] {
  return Object.values(HARDWARE_FAMILIES);
}

export function isPathEnabled(familyId: string, path: 'diagnose' | 'maintain' | 'develop'): boolean {
  const f = getFamily(familyId);
  return Boolean(f?.enabled_paths[path]);
}
