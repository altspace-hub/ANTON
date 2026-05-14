//! GET /merchant/:address/transactions  — list a merchant's tx history
//! GET /transaction/:uetr/status         — single-tx status + finality
//!
//! These are PLACEHOLDERS. Real implementations need:
//!   - FutureChain RPC integration (via @futurechain/sdk's rpc module
//!     or a Rust counterpart, both currently stubbed)
//!   - Postgres tables for tx caching / reconciliation
//!   - The reference decoder running on inbound remittances
//!
//! Sprint 1 lands the route shapes so the Expo app can call them and
//! get an empty-but-typed response. Real wiring is sprint 1 task 3+.

use axum::{
    Json,
    extract::{Path, State},
};
use serde::Serialize;

use crate::api_error::ApiError;
use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListTransactionsResponse {
    pub transactions: Vec<serde_json::Value>,
    pub total: usize,
    /// Whether this response is from a live chain query or just an
    /// empty stub. Front-end can show a "coming soon" hint while it's
    /// `false`.
    pub live: bool,
}

pub async fn list_for_merchant(
    State(state): State<AppState>,
    Path(address): Path<String>,
) -> Result<Json<ListTransactionsResponse>, ApiError> {
    // Verify the merchant exists; 404 otherwise. (Lets the client
    // distinguish "no merchant" from "merchant has no transactions".)
    if state.merchant_by_address(&address).is_none() {
        return Err(ApiError::not_found("not_found", format!("no merchant at {address}")));
    }
    Ok(Json(ListTransactionsResponse {
        transactions: vec![],
        total: 0,
        live: false,
    }))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionStatusResponse {
    pub uetr: String,
    pub status: &'static str,
    /// Stub. Real value comes from the FutureChain RPC's confirmation
    /// count.
    pub confirmations: u32,
    pub live: bool,
}

pub async fn status(Path(uetr): Path<String>) -> Result<Json<TransactionStatusResponse>, ApiError> {
    // Light validation: UETRs are 36 chars (8-4-4-4-12 hex with hyphens).
    if uetr.len() != 36 {
        return Err(ApiError::bad_request("invalid_uetr", "UETR must be 36 chars"));
    }
    Ok(Json(TransactionStatusResponse {
        uetr,
        status: "unknown",
        confirmations: 0,
        live: false,
    }))
}
