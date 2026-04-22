/**
 * schema.ts — Top-level JSON Schema (Draft 2020-12) for capability descriptors.
 *
 * Implements ANTON_Portals_Capability_Descriptor_Schema_Reference.md §3-§12.
 *
 * The verb baseline schemas live in ./verbs/*.ts and are referenced from the
 * `capabilities` array via the `verb` field. Per-capability inputSchema and
 * outputSchema are validated separately at portal-publish time (see
 * validator.ts).
 *
 * Per Cap Schema §15.2, v1.0.0 clients MUST:
 *   - accept descriptors with unknown fields (additionalProperties: true at top)
 *   - treat unknown verbs as `custom` and surface with a "new capability type" marker
 *   - reject unknown enum values in critical fields (payment type, jurisdiction)
 */

// ── Categories per Cap Schema §10.1 ─────────────────────────────────────────

export const PORTAL_CATEGORIES = [
  'personal',
  'business',
  'community',
  'commerce',
  'team',
  'creator',
  'bulletin',
  'classroom',
  'teacher',
  'organisation',
  'other',
] as const;

// ── Verbs per Cap Schema §4.1 ───────────────────────────────────────────────

export const CAPABILITY_VERBS = [
  'contact',
  'inquire',
  'request',
  'order',
  'pay',
  'book',
  'subscribe',
  'join',
  'query',
  'publish',
  'delegate',
  'authenticate',
  'custom',
] as const;

export type CapabilityVerb = (typeof CAPABILITY_VERBS)[number];

// ── Payment-method enums per Cap Schema §6.2 ────────────────────────────────

export const PAYMENT_RAILS = ['futurechain', 'external'] as const;
export const PAYMENT_TYPES = ['stablecoin', 'native', 'invoice', 'escrow', 'offline'] as const;
export const PAYMENT_SETTLEMENTS = ['instant', 'net-30', 'net-60', 'net-90', 'escrow-release', 'offline'] as const;

// ── Attestation types per Cap Schema §9.3 ───────────────────────────────────

export const ATTESTATION_TYPES = [
  'business_registration',
  'identity_verification',
  'domain_experience',
  'compliance_certification',
  'membership',
  'license',
  'other',
] as const;

// ── Schema definition ──────────────────────────────────────────────────────

export const DESCRIPTOR_SCHEMA_VERSION = 'capability-1.0.0' as const;

/**
 * The full JSON Schema Draft 2020-12 for a v1 capability descriptor. Fed
 * to ajv in validator.ts.
 */
export const DESCRIPTOR_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://anton.space/schemas/capability-descriptor-1.0.0.json',
  type: 'object',
  required: [
    'schemaVersion',
    'descriptorId',
    'issuedAt',
    'validFrom',
    'validUntil',
    'portal',
    'identity',
    'capabilities',
  ],
  additionalProperties: true,
  properties: {
    schemaVersion: { const: DESCRIPTOR_SCHEMA_VERSION },
    descriptorId: { type: 'string', minLength: 1, maxLength: 200 },
    issuedAt: { type: 'string', format: 'date-time' },
    validFrom: { type: 'string', format: 'date-time' },
    validUntil: { type: 'string', format: 'date-time' },

    portal: {
      type: 'object',
      required: ['name', 'namespace', 'displayTitle', 'category', 'contactHash', 'publicKey'],
      additionalProperties: false,
      properties: {
        name: { type: 'string', minLength: 5, maxLength: 200 }, // "<name>.<namespace>.portal"
        namespace: { type: 'string', minLength: 3, maxLength: 32 },
        displayTitle: { type: 'string', minLength: 1, maxLength: 200 },
        category: { enum: PORTAL_CATEGORIES },
        contactHash: { type: 'string', pattern: '^ANTON-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$' },
        publicKey: { type: 'string', minLength: 40 },
        // Optional surface block — describes where the human-facing HTML
        // lives. AAP capability endpoints remain on ANTON regardless of
        // surface.mode so the trust chain is preserved.
        surface: {
          type: 'object',
          additionalProperties: false,
          required: ['mode'],
          properties: {
            mode: { enum: ['managed', 'external'] },
            url: { type: 'string', format: 'uri', maxLength: 2000 },
            verifiedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },

    identity: {
      type: 'object',
      additionalProperties: true,
      properties: {
        humanContact: {
          type: 'object',
          additionalProperties: true,
          properties: {
            available: { type: 'boolean' },
            primaryAddress: { type: 'string' },
            displayName: { type: 'string' },
            role: { type: 'string' },
            languages: { type: 'array', items: { type: 'string' } },
            responseTimeHours: { type: 'number', minimum: 0 },
          },
        },
        agentContact: {
          type: 'object',
          additionalProperties: true,
          properties: {
            available: { type: 'boolean' },
            preferredProtocolVersion: { type: 'string' },
            supportedMessageTypes: { type: 'array', items: { type: 'string' } },
          },
        },
        organisationDetails: {
          type: 'object',
          additionalProperties: true,
          properties: {
            legalName: { type: 'string' },
            registrationNumber: { type: 'string' },
            jurisdiction: { type: 'string' },
          },
        },
      },
    },

    capabilities: {
      type: 'array',
      maxItems: 50,
      items: {
        type: 'object',
        required: ['id', 'verb', 'title', 'description', 'aapEndpoint'],
        additionalProperties: true,
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 100, pattern: '^[a-z0-9][a-z0-9-]*$' },
          verb: { enum: CAPABILITY_VERBS },
          customVerbName: { type: 'string', maxLength: 100 },
          title: { type: 'string', minLength: 1, maxLength: 200 },
          description: { type: 'string', minLength: 1, maxLength: 2000 },
          aapEndpoint: { type: 'string', minLength: 1, maxLength: 200 },
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          paymentCoupling: { type: 'object' },
          slaHints: { type: 'object' },
          availability: { type: 'object' },
          trustRequirements: { type: 'object' },
          tags: { type: 'array', items: { type: 'string' } },
          examples: { type: 'array' },
        },
      },
    },

    payment: {
      type: 'object',
      additionalProperties: true,
      properties: {
        supportedMethods: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'rail', 'type'],
            additionalProperties: true,
            properties: {
              id: { type: 'string' },
              rail: { enum: PAYMENT_RAILS },
              type: { enum: PAYMENT_TYPES },
              currency: { type: 'string' },
              settlement: { enum: PAYMENT_SETTLEMENTS },
              minimumAmount: { type: 'number', minimum: 0 },
              maximumAmount: { type: 'number', minimum: 0 },
              feeStructure: { type: 'object' },
              creditCheckRequired: { type: 'boolean' },
              note: { type: 'string' },
              instructionsUrl: { type: 'string' },
            },
          },
        },
        preferredMethod: { type: 'string' },
      },
    },

    policies: {
      type: 'object',
      additionalProperties: true,
      properties: {
        terms: { type: 'object' },
        privacy: { type: 'object' },
        dataMinimisation: { type: 'object' },
        cookies: { type: 'object' },
        ageRequirement: {
          type: 'object',
          additionalProperties: true,
          properties: {
            minimumAge: { type: 'integer', minimum: 0 },
            reason: { type: 'string' },
          },
        },
      },
    },

    availability: {
      type: 'object',
      additionalProperties: true,
      properties: {
        timezone: { type: 'string' },
        hoursOfOperation: { type: 'object' },
        leadTimeDays: { type: 'number', minimum: 0 },
        bookingHorizonDays: { type: 'number', minimum: 0 },
        unavailableDates: { type: 'array', items: { type: 'string', format: 'date' } },
      },
    },

    attestations: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type', 'issuer', 'claim'],
        additionalProperties: true,
        properties: {
          type: { enum: ATTESTATION_TYPES },
          issuer: { type: 'string' },
          claim: { type: 'object' },
          claimedAt: { type: 'string', format: 'date-time' },
          verificationMethod: { type: 'string' },
          verificationNote: { type: 'string' },
          // Reserved for v1.1+ third-party issuers per §9.4 — accepted but flagged.
          issuerPublicKey: { type: 'string' },
          signature: { type: 'string' },
          validFrom: { type: 'string', format: 'date-time' },
          validUntil: { type: 'string', format: 'date-time' },
        },
      },
    },

    discoveryMetadata: {
      type: 'object',
      additionalProperties: true,
      properties: {
        publicIndex: { type: 'boolean' },
        primaryCategory: { enum: PORTAL_CATEGORIES },
        secondaryCategories: { type: 'array', items: { type: 'string' } },
        tags: { type: 'array', items: { type: 'string' } },
        serviceAreas: { type: 'array', items: { type: 'string' } },
        languages: { type: 'array', items: { type: 'string' } },
        serviceRadius: { type: 'object' },
        keywords: { type: 'array', items: { type: 'string' } },
      },
    },

    localizations: {
      // Nested JSON per investigation §E.6 (matches existing public/locales/*.json pattern).
      // Top-level keys are BCP 47 language codes; values are nested JSON mirroring the descriptor.
      type: 'object',
      additionalProperties: { type: 'object' },
    },

    extensions: {
      type: 'object',
      // Extension keys MUST be x-prefixed per Cap Schema §12.
      patternProperties: {
        '^x-': {},
      },
      additionalProperties: false,
    },
  },
} as const;
