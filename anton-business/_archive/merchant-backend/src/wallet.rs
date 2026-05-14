//! wallet — secp256k1 address derivation.
//!
//! PLACEHOLDER: uses the Ethereum-style address derivation
//! (last 20 bytes of keccak-256 over the uncompressed pubkey x||y,
//! "fc_"-prefixed hex). Real format pending `wallet.rs` from the
//! FutureChain Rust core being vendored. The TS counterpart in
//! `@futurechain/sdk/wallet` uses the same placeholder formula and the
//! parity tests guarantee both stay aligned.

use secp256k1::PublicKey;
use sha3::{Digest, Keccak256};

#[derive(Debug, thiserror::Error)]
pub enum AddressError {
    #[error("unexpected pubkey length: {0}")]
    BadLength(usize),
    #[error("invalid compressed pubkey: {0}")]
    InvalidCompressed(String),
}

/// Derive a FutureChain address from a secp256k1 public key.
///
/// Accepts compressed (33 bytes, 0x02/0x03 prefix) or uncompressed
/// (65 bytes, 0x04 prefix). Returns an "fc_"-prefixed lowercase hex
/// string of 43 chars total.
pub fn address_from_public_key(pubkey: &[u8]) -> Result<String, AddressError> {
    let xy: Vec<u8> = match pubkey.len() {
        65 if pubkey[0] == 0x04 => pubkey[1..].to_vec(),
        33 if pubkey[0] == 0x02 || pubkey[0] == 0x03 => {
            let pk = PublicKey::from_slice(pubkey)
                .map_err(|e| AddressError::InvalidCompressed(e.to_string()))?;
            pk.serialize_uncompressed()[1..].to_vec()
        }
        other => return Err(AddressError::BadLength(other)),
    };
    let hash = Keccak256::digest(&xy);
    let last20 = &hash[hash.len() - 20..];
    Ok(format!("fc_{}", hex::encode(last20)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use secp256k1::{Secp256k1, SecretKey};

    fn deterministic_priv() -> [u8; 32] {
        let mut out = [0u8; 32];
        for i in 0..32 {
            out[i] = (i + 1) as u8;
        }
        out
    }

    #[test]
    fn compressed_and_uncompressed_match() {
        let secp = Secp256k1::new();
        let sk = SecretKey::from_slice(&deterministic_priv()).unwrap();
        let pk = PublicKey::from_secret_key(&secp, &sk);
        let compressed = pk.serialize();
        let uncompressed = pk.serialize_uncompressed();
        let a = address_from_public_key(&compressed).unwrap();
        let b = address_from_public_key(&uncompressed).unwrap();
        assert_eq!(a, b);
    }

    #[test]
    fn format_is_fc_prefix_plus_40_lowercase_hex() {
        let secp = Secp256k1::new();
        let sk = SecretKey::from_slice(&deterministic_priv()).unwrap();
        let pk = PublicKey::from_secret_key(&secp, &sk);
        let addr = address_from_public_key(&pk.serialize_uncompressed()).unwrap();
        assert!(addr.starts_with("fc_"));
        assert_eq!(addr.len(), 3 + 40);
        assert!(addr[3..].chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
    }

    #[test]
    fn rejects_unexpected_length() {
        let r = address_from_public_key(&[0; 10]);
        assert!(matches!(r, Err(AddressError::BadLength(10))));
    }

    /// Parity with the TS placeholder: the deterministic 0x01..0x20
    /// private key yields exactly this address per the fixture file.
    #[test]
    fn parity_with_ts_placeholder_address() {
        let fixture: serde_json::Value = serde_json::from_str(
            include_str!("../../../tests/fixtures/delegation.json")
        ).unwrap();
        let expected = fixture["testAddress"].as_str().unwrap();

        let secp = Secp256k1::new();
        let sk = SecretKey::from_slice(&deterministic_priv()).unwrap();
        let pk = PublicKey::from_secret_key(&secp, &sk);
        let actual = address_from_public_key(&pk.serialize_uncompressed()).unwrap();
        assert_eq!(actual, expected);
    }
}
