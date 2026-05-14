//! POST /merchant/:address/delegate — register a signed settlement delegation.
//! GET  /merchant/:address/delegate — return the current active delegation.
//!
//! The POST handler is the load-bearing one for ADR-005. Flow:
//!
//!   1. Parse the wire envelope (`SignedDelegation`).
//!   2. Check schemaVersion == "v1".
//!   3. Confirm the path address matches the payload's walletAddress.
//!   4. Verify the signature recovers to walletAddress (signature
//!      validity + signer-binding in one step via `verify_signature`).
//!   5. Reject expired delegations (`validUntil <= now`).
//!   6. Reject replays (nonce already consumed by this merchant).
//!   7. Persist as the merchant's active delegation, superseding any
//!      prior one.
//!
//! The merchant doesn't need to be pre-registered — onboarding can
//! happen in any order — but the active delegation is namespaced by
//! walletAddress regardless.

use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use chrono::Utc;

use crate::api_error::ApiError;
use crate::delegation::{SignedDelegation, verify_signature};
use crate::state::AppState;

pub async fn put_delegation(
    State(state): State<AppState>,
    Path(address): Path<String>,
    Json(env): Json<SignedDelegation>,
) -> Result<(StatusCode, Json<SignedDelegation>), ApiError> {
    if env.payload.wallet_address != address {
        return Err(ApiError::bad_request(
            "address_mismatch",
            "path walletAddress does not match payload.walletAddress",
        ));
    }
    if let Err(e) = verify_signature(&env) {
        // The DelegationError enum has distinct kinds; surface them
        // with stable codes so the client can dispatch on the cause.
        return Err(match e {
            crate::delegation::DelegationError::SchemaUnknown { .. } => {
                ApiError::bad_request("schema_unknown", e.to_string())
            }
            crate::delegation::DelegationError::MalformedSignature { .. } => {
                ApiError::bad_request("malformed_signature", e.to_string())
            }
            crate::delegation::DelegationError::MalformedPayload { .. } => {
                ApiError::bad_request("malformed_payload", e.to_string())
            }
            crate::delegation::DelegationError::SignerMismatch { .. } => {
                ApiError::unauthorised("signer_mismatch", e.to_string())
            }
            crate::delegation::DelegationError::Expired { .. } => {
                ApiError::bad_request("expired", e.to_string())
            }
        });
    }

    // Expiry — verify_signature deliberately doesn't check this so we
    // can do it here with a fresh `now`.
    let now = Utc::now().timestamp();
    if env.payload.valid_until <= now {
        return Err(ApiError::bad_request(
            "expired",
            format!(
                "delegation expired at {}, now {}",
                env.payload.valid_until, now
            ),
        ));
    }

    // Replay protection: a nonce can only be used once per merchant.
    let fresh = state
        .record_nonce(&address, &env.payload.nonce)
        .await
        .map_err(|e| ApiError::internal(format!("storage: {e}")))?;
    if !fresh {
        return Err(ApiError::conflict(
            "nonce_reused",
            "this nonce has already been consumed for this merchant",
        ));
    }

    state
        .save_delegation(&address, env.clone())
        .await
        .map_err(|e| ApiError::internal(format!("storage: {e}")))?;
    Ok((StatusCode::CREATED, Json(env)))
}

pub async fn get_delegation(
    State(state): State<AppState>,
    Path(address): Path<String>,
) -> Result<Json<SignedDelegation>, ApiError> {
    state
        .current_delegation(&address)
        .await
        .map_err(|e| ApiError::internal(format!("storage: {e}")))?
        .map(Json)
        .ok_or_else(|| ApiError::not_found("no_active_delegation", format!("no active delegation for {address}")))
}
