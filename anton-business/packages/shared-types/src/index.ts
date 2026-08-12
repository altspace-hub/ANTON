/**
 * @anton-business/shared-types
 *
 * The HTTP contract between the React Native app and the Rust merchant-
 * backend. Defining it here in TS, then verifying parity with the Rust
 * structs via a snapshot test (TODO sprint 1 task 2).
 *
 * Wire format: JSON. BigInt is serialised as a decimal string (micro-FTC
 * amounts don't fit in JS Number).
 */

/** Merchant identity per spec §1.1. Stored in fc_kyb table on backend. */
export interface Merchant {
  id: string;
  walletAddress: string;
  legalName: string;
  orgNr: string;       // Swedish organisationsnummer
  country: 'SE';
  city: string;
  street: string;
  postcode: string;
  vatRegistered: boolean;
  /** ISO 8601 timestamp of KYB approval. */
  approvedAt: string;
}

export type SettlementMode = 'HOLD' | 'AUTO_CONVERT' | 'HYBRID';

export interface MerchantSettlementConfig {
  mode: SettlementMode;
  /** Threshold (decimal-string FTC) below which auto-convert is skipped. */
  thresholdFtc: string;
  /** For HYBRID mode: amount to keep on-chain. */
  holdAmountFtc: string;
  exchangeMerchantId?: string;
  exchangeReceivingAddress?: string;
  bankAccount?: {
    iban?: string;
    /** Swedish clearing + account number for non-IBAN flows. */
    clearing?: string;
    accountNumber?: string;
  };
}

/** Server-side transaction record returned by /merchant/:address/transactions. */
export interface Transaction {
  uetr: string;
  invoiceId: string;
  status: 'pending' | 'confirmed' | 'rejected' | 'refunded' | 'partially_refunded';
  amountMicroFtc: string;       // BigInt as decimal string
  amountSek?: string;            // optional, computed at quote time
  rate?: string;                 // FTC→SEK rate used (BigDecimal as string)
  purpose: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
  confirmedAt?: string;
  /** When this is a refund, the UETR of the original tx. */
  refundOf?: string;
  /** Decoded reference fields, if recognised. */
  decodedReference?: Record<string, unknown>;
}

/** Server-side settlement record returned by /merchant/:address/settlements. */
export interface Settlement {
  id: string;
  txUetr: string;
  ftcAmount: string;
  sekAmount?: string;
  rate?: string;
  exchangePayoutId?: string;
  status: 'pending_chain' | 'pending_payout' | 'paid_out' | 'failed';
  createdAt: string;
  paidOutAt?: string;
}

/** POST /merchant/register. Used at the end of off-app KYB. */
export interface RegisterMerchantRequest {
  walletAddress: string;
  /** Hash of the KYB documents — actual docs stay off-chain. */
  kybMetadataHash: string;
  legalName: string;
  orgNr: string;
  city: string;
  street: string;
  postcode: string;
  vatRegistered: boolean;
}

export interface RegisterMerchantResponse {
  merchantId: string;
  /** Server-issued activation token, single-use. */
  activationToken: string;
}

/** Generic error envelope used by every non-2xx response. */
export interface ApiError {
  code: string;
  message: string;
  /** Optional structured detail, e.g. field errors. */
  detail?: Record<string, unknown>;
}
