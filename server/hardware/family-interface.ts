/**
 * family-interface.ts — contract that every hardware-family-specific module
 * implements.
 *
 * A "family" is a class of microcontroller / SoC / SBC (ESP32, Arduino,
 * Raspberry Pi, STM32, nRF52, RP2040). Adding a new family at runtime
 * requires:
 *   1. A registry entry in `family-registry.ts`
 *   2. A `server/hardware/families/{family_id}/` directory implementing
 *      this interface
 *
 * The launch family is `esp32`; the others have reserved registry entries
 * and stub directories with README.md explaining the extension pattern.
 */

/** Verified primitive operation — small reference snippets the firmware
 *  generator uses as building blocks (blink, read-adc, i2c-scan, etc.) */
export interface Primitive {
  id: string;                     // e.g. 'blink', 'i2c-scan'
  display_name: string;
  language: string;               // 'cpp', 'arduino-c', 'python', etc.
  source_path: string;            // path to the actual primitive source within the family directory
  required_components: string[];  // hardware components the primitive assumes
  description: string;
}

/** Toolchain configuration for the family */
export interface ToolchainConfig {
  build_system: 'platformio' | 'arduino-ide' | 'raspberry-pi-pico-sdk' | 'esp-idf' | string;
  default_environment: Record<string, unknown>;
  supported_frameworks: string[];
  required_cli_tools: string[];   // CLI tools that must be on PATH
}

/** Simulation configuration */
export interface SimulationConfig {
  primary_simulator: 'wokwi' | 'renode' | 'qemu' | 'none';
  supported_variants: string[];
  /** Build a simulator-specific project descriptor from a generic firmware bundle */
  buildDescriptor: (firmwareBundlePath: string) => Promise<unknown>;
}

/** Pin-naming convention translator */
export interface PinNamingConvention {
  convention: string;  // 'gpio-numeric', 'digital-analog-split', 'bcm-numbering'
  /** Canonical → family-native (e.g. 'gpio-2' → 'GPIO 2' or 'D2' or 'BCM 27') */
  toFamilyNative: (canonical: string) => string;
  /** Family-native → canonical */
  toCanonical: (familyNative: string) => string;
}

/** Secure-update support */
export interface SecureUpdateConfig {
  default_supported: boolean;
  mechanism: 'ota-signed' | 'serial-only' | 'none';
  /** Optional helper to generate the secure-update boot config for a project */
  generateBootConfig?: (project_id: string) => Promise<Record<string, unknown>>;
}

/**
 * The full family-implementation interface. Every
 * `server/hardware/families/{family_id}/index.ts` exports an object that
 * satisfies this.
 */
export interface FamilyImplementation {
  family_id: string;
  primitives: Primitive[];
  toolchain: ToolchainConfig;
  simulation: SimulationConfig;
  pin_naming: PinNamingConvention;
  secure_update: SecureUpdateConfig;
  /** Identify a hardware variant from a photo (vision-model based). Optional;
   *  families without trained vision models return `null`. */
  identifyFromPhoto?: (photoPath: string) => Promise<{ variant: string; confidence: number } | null>;
}
