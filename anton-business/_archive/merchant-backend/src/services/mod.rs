//! Service modules — stateful, long-lived business logic used by route
//! handlers. Stateless primitives that need byte-for-byte parity with
//! the TS SDK live at the crate root instead (`reference`, `delegation`,
//! `wallet`) so they can be tested without compiling the axum/sqlx
//! stack.
//!
//! Sprint 1 lands here:
//!   - reconciliation.rs  Match incoming PACS.008s to merchants.
//!   - safello.rs         Convert FTC → SEK, trigger payouts.
//!   - email.rs           Kvitto + daily report delivery.
//!   - kyb.rs             Bolagsverket / Skatteverket lookups.
