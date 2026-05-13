//! Service modules — long-lived business logic, not request handlers.
//!
//! Sprint 1 lands:
//!   - delegation.rs    Verify SignedDelegation envelopes (ADR-005)
//!   - reference.rs     Encode/decode remittance fields (ADR-004), parity with SDK
//!   - reconciliation.rs Match incoming PACS.008s to merchants
//!   - safello.rs       Convert FTC → SEK, trigger payouts
//!   - email.rs         Send kvitto + daily reports
//!   - kyb.rs           Look up Bolagsverket / Skatteverket data
//!
//! Each module exposes a thin `pub fn` API consumed by route handlers.
