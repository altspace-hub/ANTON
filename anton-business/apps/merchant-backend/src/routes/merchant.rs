//! POST /merchant/register — onboard a new merchant after KYB.
//! GET  /merchant/:id      — fetch by merchant id.
//! GET  /merchant/by-address/:address — fetch by wallet address.
//!
//! Merchant-ID allocation: per ADR-004, deterministic from
//! orgNr+pubkey. We use first 4 bytes of keccak-256 as uppercase hex
//! (8 chars [0-9A-F]) — within the merchant_id grammar [A-Z0-9]{8}.
//! Collisions resolve at registration time by re-trying with an
//! incremented suffix (per ADR-004 §11.3).

use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha3::{Digest, Keccak256};

use crate::api_error::ApiError;
use crate::state::{AppState, Merchant};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterMerchantRequest {
    pub wallet_address: String,
    /// Hash (lowercase hex) of the KYB documents — the actual KYB
    /// docs stay off-chain.
    pub kyb_metadata_hash: String,
    pub legal_name: String,
    pub org_nr: String,
    pub city: String,
    pub street: String,
    pub postcode: String,
    pub vat_registered: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterMerchantResponse {
    pub merchant_id: String,
    /// Single-use token the app exchanges for a wallet-bound session.
    /// Sprint 1 stub: a random 32-byte hex string. Not yet enforced
    /// anywhere — wired in when the auth middleware lands.
    pub activation_token: String,
}

/// Derive a deterministic merchant_id from orgNr + walletAddress per
/// ADR-004 §11.3. Returns the candidate; the caller resolves
/// collisions by appending a 1-digit suffix and re-checking.
fn candidate_merchant_id(org_nr: &str, wallet_address: &str) -> String {
    let mut hasher = Keccak256::new();
    hasher.update(org_nr.as_bytes());
    hasher.update(wallet_address.as_bytes());
    let digest = hasher.finalize();
    // First 4 bytes → 8 hex chars, uppercased to match the
    // /^[A-Z0-9]{8}$/ grammar.
    hex::encode(&digest[..4]).to_ascii_uppercase()
}

fn random_token() -> String {
    // Sprint 1 stub: derive from the system clock + a per-call counter.
    // Replaced with `rand::random::<[u8; 32]>()` once the rand crate
    // is enabled. For now, deterministic-ish is fine because nothing
    // consumes the token yet.
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let counter = COUNTER.fetch_add(1, Ordering::Relaxed);
    let now = chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0);
    let mut hasher = Keccak256::new();
    hasher.update(&now.to_be_bytes());
    hasher.update(&counter.to_be_bytes());
    hex::encode(hasher.finalize())
}

pub async fn register(
    State(state): State<AppState>,
    Json(req): Json<RegisterMerchantRequest>,
) -> Result<(StatusCode, Json<RegisterMerchantResponse>), ApiError> {
    // Basic field validation. The TS wire types already constrain
    // shape; this guards the few invariants the type system can't
    // express.
    if req.org_nr.is_empty() {
        return Err(ApiError::bad_request("invalid_org_nr", "orgNr must not be empty"));
    }
    if req.wallet_address.is_empty() {
        return Err(ApiError::bad_request("invalid_wallet", "walletAddress must not be empty"));
    }
    if req.kyb_metadata_hash.len() != 64 || !req.kyb_metadata_hash.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(ApiError::bad_request(
            "invalid_kyb_hash",
            "kybMetadataHash must be 64 lowercase hex chars",
        ));
    }
    if state.merchant_by_address(&req.wallet_address).is_some() {
        return Err(ApiError::conflict(
            "already_registered",
            "this walletAddress is already registered",
        ));
    }

    // Allocate merchant_id with collision retry per ADR-004.
    let base = candidate_merchant_id(&req.org_nr, &req.wallet_address);
    let merchant_id = (0..36)
        .map(|i| {
            if i == 0 {
                base.clone()
            } else {
                // Replace the last char with i (0-9, A-Z = base36) for
                // a 36-slot collision recovery window. Beyond 36 the
                // spec says regenerate from a different deterministic
                // input — but in practice this almost never trips.
                let mut id = base.clone();
                id.pop();
                let suffix = std::char::from_digit(i, 36).unwrap().to_ascii_uppercase();
                id.push(suffix);
                id
            }
        })
        .find(|id| !state.merchant_id_taken(id))
        .ok_or_else(|| ApiError::internal("merchant id collision space exhausted"))?;

    let merchant = Merchant {
        id: merchant_id.clone(),
        wallet_address: req.wallet_address.clone(),
        legal_name: req.legal_name,
        org_nr: req.org_nr,
        country: "SE".to_string(),
        city: req.city,
        street: req.street,
        postcode: req.postcode,
        vat_registered: req.vat_registered,
        approved_at: Utc::now(),
    };
    state.insert_merchant(merchant);

    Ok((
        StatusCode::CREATED,
        Json(RegisterMerchantResponse {
            merchant_id,
            activation_token: random_token(),
        }),
    ))
}

pub async fn get_by_id(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Merchant>, ApiError> {
    state
        .merchant_by_id(&id)
        .map(Json)
        .ok_or_else(|| ApiError::not_found("not_found", format!("no merchant with id {id}")))
}

pub async fn get_by_address(
    State(state): State<AppState>,
    Path(address): Path<String>,
) -> Result<Json<Merchant>, ApiError> {
    state
        .merchant_by_address(&address)
        .map(Json)
        .ok_or_else(|| ApiError::not_found("not_found", format!("no merchant at address {address}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merchant_id_format_matches_grammar() {
        let id = candidate_merchant_id("SE5560000000", "fc_abcdef");
        assert_eq!(id.len(), 8);
        assert!(id.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()));
    }

    #[test]
    fn merchant_id_is_deterministic() {
        let a = candidate_merchant_id("SE5560000000", "fc_abc");
        let b = candidate_merchant_id("SE5560000000", "fc_abc");
        assert_eq!(a, b);
    }

    #[test]
    fn merchant_id_changes_with_input() {
        let a = candidate_merchant_id("SE5560000000", "fc_abc");
        let b = candidate_merchant_id("SE5560000001", "fc_abc");
        assert_ne!(a, b);
    }
}
