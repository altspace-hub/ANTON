//! delegation — Settlement delegation: build, sign, verify.
//!
//! Implements ADR-005. See anton-business/docs/adr/ADR-005-delegation-envelope.md.
//!
//! The TS counterpart in `@futurechain/sdk/delegation` produces the
//! same canonical bytes for the same payload. Parity is enforced by
//! fixtures in `anton-business/tests/fixtures/delegation.json` — Rust
//! consumes the file and asserts byte-for-byte agreement with the TS
//! reference output.

use std::collections::BTreeMap;

use secp256k1::{
    Message, PublicKey, Secp256k1, SecretKey,
    ecdsa::{RecoverableSignature, RecoveryId},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::wallet::address_from_public_key;

/// Domain separation tag per ADR-005. Must match the TS constant
/// `DELEGATION_DOMAIN` byte-for-byte.
pub const DELEGATION_DOMAIN: &str = "anton-business:settlement-delegation:v1";

/// Settlement delegation payload — spec §12.3.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettlementDelegation {
    pub merchant_id: String,
    pub wallet_address: String,
    pub safello_receiving_address: String,
    /// Stored as a JSON string for portability (no native u128 in JSON).
    #[serde(with = "u128_str")]
    pub max_per_day_micro_ftc: u128,
    pub valid_until: i64,
    pub nonce: String,
}

/// Signed envelope wire format.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignedDelegation {
    pub schema_version: String,
    pub payload: SettlementDelegation,
    /// 0x-prefixed hex of 65 bytes (r||s||recId).
    pub signature: String,
}

/// Discriminated union mirroring TS `DelegationError`.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum DelegationError {
    #[error("unknown schema: {got}")]
    SchemaUnknown { got: String },
    #[error("malformed signature: {reason}")]
    MalformedSignature { reason: String },
    #[error("malformed payload on {field}: {reason}")]
    MalformedPayload { field: String, reason: String },
    #[error("signer mismatch: expected {expected}, recovered {recovered}")]
    SignerMismatch { expected: String, recovered: String },
    #[error("delegation expired at {valid_until}, now {now}")]
    Expired { valid_until: i64, now: i64 },
}

// ── Canonical JSON ──────────────────────────────────────────────────
//
// Minimal RFC 8785 JCS subset: keys sorted lexicographically (byte-wise
// on UTF-8), no whitespace, JSON-standard string escaping. Numbers are
// passed through serde_json::Value (which preserves source form) — for
// our payload type the only non-string number is validUntil (i64),
// which serializes identically on both sides.

fn canonicalise(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::Null => "null".into(),
        serde_json::Value::Bool(b) => if *b { "true".into() } else { "false".into() },
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::String(s) => serde_json::to_string(s).expect("escape string"),
        serde_json::Value::Array(a) => {
            let parts: Vec<String> = a.iter().map(canonicalise).collect();
            format!("[{}]", parts.join(","))
        }
        serde_json::Value::Object(map) => {
            // BTreeMap orders by key — matches the TS Object.keys().sort()
            // lexicographic ordering for ASCII keys.
            let sorted: BTreeMap<&String, &serde_json::Value> = map.iter().collect();
            let parts: Vec<String> = sorted
                .iter()
                .map(|(k, v)| format!("{}:{}", serde_json::to_string(k).unwrap(), canonicalise(v)))
                .collect();
            format!("{{{}}}", parts.join(","))
        }
    }
}

/// Build the bytes that get hashed: domain || 0x0a || canonical_json(payload).
/// The caller applies SHA-256 to this output.
pub fn build_hash_input(payload: &SettlementDelegation) -> Vec<u8> {
    // Wire representation: BigInt-as-decimal-string, all other types
    // pass through. Build via serde_json::Value so canonicalise() sees
    // the same shape as the TS side.
    let wire = serde_json::json!({
        "maxPerDayMicroFtc": payload.max_per_day_micro_ftc.to_string(),
        "merchantId": payload.merchant_id,
        "nonce": payload.nonce,
        "safelloReceivingAddress": payload.safello_receiving_address,
        "validUntil": payload.valid_until,
        "walletAddress": payload.wallet_address,
    });
    let body = canonicalise(&wire);
    let mut out = Vec::with_capacity(DELEGATION_DOMAIN.len() + 1 + body.len());
    out.extend_from_slice(DELEGATION_DOMAIN.as_bytes());
    out.push(0x0a);
    out.extend_from_slice(body.as_bytes());
    out
}

// ── Sign ────────────────────────────────────────────────────────────

/// Sign a SettlementDelegation. Used primarily for testing and fixture
/// generation; production backends only verify. Returns the wire envelope.
pub fn sign(
    payload: &SettlementDelegation,
    private_key: &[u8; 32],
) -> Result<SignedDelegation, String> {
    let secp = Secp256k1::new();
    let sk = SecretKey::from_slice(private_key).map_err(|e| e.to_string())?;
    let hash_input = build_hash_input(payload);
    let mut hasher = Sha256::new();
    hasher.update(&hash_input);
    let msg_hash: [u8; 32] = hasher.finalize().into();
    let msg = Message::from_digest(msg_hash);
    let sig = secp.sign_ecdsa_recoverable(&msg, &sk);
    let (rec_id, compact) = sig.serialize_compact();
    let mut sig_bytes = [0u8; 65];
    sig_bytes[..64].copy_from_slice(&compact);
    sig_bytes[64] = i32::from(rec_id) as u8;
    Ok(SignedDelegation {
        schema_version: "v1".into(),
        payload: payload.clone(),
        signature: format!("0x{}", hex::encode(sig_bytes)),
    })
}

// ── Verify ──────────────────────────────────────────────────────────

/// Recover the signer's FutureChain address from a SignedDelegation.
/// Does not validate expiry/nonce.
pub fn recover_signer(envelope: &SignedDelegation) -> Result<String, DelegationError> {
    if envelope.schema_version != "v1" {
        return Err(DelegationError::SchemaUnknown { got: envelope.schema_version.clone() });
    }

    let raw = envelope.signature.strip_prefix("0x").unwrap_or(&envelope.signature);
    let sig_bytes = hex::decode(raw)
        .map_err(|e| DelegationError::MalformedSignature { reason: e.to_string() })?;
    if sig_bytes.len() != 65 {
        return Err(DelegationError::MalformedSignature {
            reason: format!("expected 65 bytes, got {}", sig_bytes.len()),
        });
    }
    let rec_id_byte = sig_bytes[64];
    if rec_id_byte != 0 && rec_id_byte != 1 {
        return Err(DelegationError::MalformedSignature {
            reason: format!("invalid recovery id {rec_id_byte}"),
        });
    }
    let rec_id = RecoveryId::try_from(rec_id_byte as i32)
        .map_err(|e| DelegationError::MalformedSignature { reason: e.to_string() })?;
    let sig = RecoverableSignature::from_compact(&sig_bytes[..64], rec_id)
        .map_err(|e| DelegationError::MalformedSignature { reason: e.to_string() })?;

    let hash_input = build_hash_input(&envelope.payload);
    let mut hasher = Sha256::new();
    hasher.update(&hash_input);
    let msg_hash: [u8; 32] = hasher.finalize().into();
    let msg = Message::from_digest(msg_hash);

    let secp = Secp256k1::new();
    let pubkey: PublicKey = secp.recover_ecdsa(&msg, &sig)
        .map_err(|e| DelegationError::MalformedSignature { reason: e.to_string() })?;
    let pub_uncompressed = pubkey.serialize_uncompressed();
    let addr = address_from_public_key(&pub_uncompressed)
        .map_err(|e| DelegationError::MalformedSignature { reason: e.to_string() })?;
    Ok(addr)
}

/// Verify that the signature recovers to `payload.walletAddress`. Does
/// not check expiry/nonce.
pub fn verify_signature(envelope: &SignedDelegation) -> Result<(), DelegationError> {
    let recovered = recover_signer(envelope)?;
    if recovered != envelope.payload.wallet_address {
        return Err(DelegationError::SignerMismatch {
            expected: envelope.payload.wallet_address.clone(),
            recovered,
        });
    }
    Ok(())
}

// ── u128 ↔ JSON decimal string serializer ──────────────────────────

mod u128_str {
    use serde::{Deserialize, Deserializer, Serializer};
    pub fn serialize<S: Serializer>(v: &u128, ser: S) -> Result<S::Ok, S::Error> {
        ser.serialize_str(&v.to_string())
    }
    pub fn deserialize<'de, D: Deserializer<'de>>(de: D) -> Result<u128, D::Error> {
        let s: String = Deserialize::deserialize(de)?;
        s.parse::<u128>().map_err(serde::de::Error::custom)
    }
}

// ── Tests ───────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use secp256k1::{Secp256k1, SecretKey, PublicKey};

    fn test_priv() -> [u8; 32] {
        let mut out = [0u8; 32];
        for i in 0..32 {
            out[i] = (i + 1) as u8;
        }
        out
    }

    fn test_address() -> String {
        let secp = Secp256k1::new();
        let sk = SecretKey::from_slice(&test_priv()).unwrap();
        let pk = PublicKey::from_secret_key(&secp, &sk);
        address_from_public_key(&pk.serialize_uncompressed()).unwrap()
    }

    fn baseline() -> SettlementDelegation {
        SettlementDelegation {
            merchant_id: "KTH00001".into(),
            wallet_address: test_address(),
            safello_receiving_address: "fc_safelloaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".into(),
            max_per_day_micro_ftc: 1_000_000_000,
            valid_until: 1_893_456_000,
            nonce: "550e8400-e29b-41d4-a716-446655440000".into(),
        }
    }

    #[test]
    fn build_hash_input_starts_with_domain() {
        let bytes = build_hash_input(&baseline());
        assert!(bytes.starts_with(DELEGATION_DOMAIN.as_bytes()));
        assert_eq!(bytes[DELEGATION_DOMAIN.len()], 0x0a);
    }

    #[test]
    fn build_hash_input_is_deterministic() {
        let a = build_hash_input(&baseline());
        let b = build_hash_input(&baseline());
        assert_eq!(a, b);
    }

    #[test]
    fn build_hash_input_bigint_serialised_as_string() {
        let bytes = build_hash_input(&SettlementDelegation { max_per_day_micro_ftc: 1, ..baseline() });
        let body = std::str::from_utf8(&bytes[DELEGATION_DOMAIN.len() + 1..]).unwrap();
        assert!(body.contains("\"maxPerDayMicroFtc\":\"1\""));
        assert!(!body.contains("\"maxPerDayMicroFtc\":1,"));
    }

    #[test]
    fn build_hash_input_number_serialised_as_number() {
        let bytes = build_hash_input(&SettlementDelegation { valid_until: 42, ..baseline() });
        let body = std::str::from_utf8(&bytes[DELEGATION_DOMAIN.len() + 1..]).unwrap();
        assert!(body.contains("\"validUntil\":42"));
        assert!(!body.contains("\"validUntil\":\"42\""));
    }

    #[test]
    fn sign_then_verify_roundtrip() {
        let env = sign(&baseline(), &test_priv()).unwrap();
        assert_eq!(env.schema_version, "v1");
        assert!(env.signature.starts_with("0x"));
        assert_eq!(env.signature.len(), 2 + 65 * 2);
        verify_signature(&env).unwrap();
    }

    #[test]
    fn verify_rejects_signer_mismatch() {
        let env = sign(&baseline(), &test_priv()).unwrap();
        let mut bad = env.clone();
        bad.payload.wallet_address = "fc_deadbeef".into();
        let r = verify_signature(&bad);
        assert!(matches!(r, Err(DelegationError::SignerMismatch { .. })));
    }

    #[test]
    fn verify_rejects_tampered_payload() {
        let env = sign(&baseline(), &test_priv()).unwrap();
        let mut bad = env.clone();
        bad.payload.max_per_day_micro_ftc = 9_999_999;
        let r = verify_signature(&bad);
        // Recovered signer no longer matches the (now changed) walletAddress.
        assert!(matches!(r, Err(DelegationError::SignerMismatch { .. })));
    }

    #[test]
    fn recover_returns_schema_unknown_for_non_v1() {
        let mut env = sign(&baseline(), &test_priv()).unwrap();
        env.schema_version = "v999".into();
        let r = recover_signer(&env);
        assert!(matches!(r, Err(DelegationError::SchemaUnknown { .. })));
    }

    #[test]
    fn recover_returns_malformed_signature_for_bad_hex() {
        let mut env = sign(&baseline(), &test_priv()).unwrap();
        env.signature = "0xnothex".into();
        let r = recover_signer(&env);
        assert!(matches!(r, Err(DelegationError::MalformedSignature { .. })));
    }

    // ── Parity: load TS-generated fixtures and assert byte equality ──

    #[test]
    fn parity_hash_input_matches_ts() {
        let fixture: serde_json::Value = serde_json::from_str(
            include_str!("../../../tests/fixtures/delegation.json")
        ).unwrap();
        let cases = fixture["cases"].as_array().unwrap();
        for case in cases {
            let name = case["name"].as_str().unwrap();
            let payload: SettlementDelegation = serde_json::from_value(case["payload"].clone()).unwrap();
            let expected_hex = case["hashInputHex"].as_str().unwrap();
            let actual = build_hash_input(&payload);
            assert_eq!(hex::encode(&actual), expected_hex, "case '{name}'");
        }
    }

    #[test]
    fn parity_signature_matches_ts() {
        let fixture: serde_json::Value = serde_json::from_str(
            include_str!("../../../tests/fixtures/delegation.json")
        ).unwrap();
        let priv_hex = fixture["testPrivateKeyHex"].as_str().unwrap();
        let priv_bytes: [u8; 32] = hex::decode(priv_hex).unwrap().try_into().unwrap();
        let cases = fixture["cases"].as_array().unwrap();
        for case in cases {
            let name = case["name"].as_str().unwrap();
            let payload: SettlementDelegation = serde_json::from_value(case["payload"].clone()).unwrap();
            let expected_sig = case["signature"].as_str().unwrap();
            let env = sign(&payload, &priv_bytes).unwrap();
            assert_eq!(env.signature, expected_sig, "case '{name}'");
            // And verify the produced envelope.
            verify_signature(&env).unwrap();
        }
    }
}
