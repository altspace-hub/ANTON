//! HTTP route modules. Each file maps 1:1 to a feature.
//!
//! Sprint 1 lands:
//!   - merchant.rs   POST /merchant/register, GET /merchant/:id
//!   - txs.rs        GET /merchant/:address/transactions
//!   - settlements.rs GET /merchant/:address/settlements
//!   - delegation.rs POST /merchant/:address/delegate
//!
//! Everything is bound in `main.rs`.

pub mod health;
