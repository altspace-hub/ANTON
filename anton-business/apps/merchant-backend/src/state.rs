//! state — shared application state for route handlers.
//!
//! For sprint 1 this is in-memory only. The shape mirrors what the
//! eventual Postgres schema will look like, so swapping to sqlx in a
//! follow-on task is a localised change inside each handler.
//!
//! All maps are wrapped in `Arc<RwLock<…>>` so handlers can clone the
//! state cheaply and the lock guards a coherent snapshot during each
//! request. With a real DB this disappears — sqlx's pool is already
//! Clone+Send+Sync.

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::delegation::SignedDelegation;

/// A registered merchant. Wire shape matches the TS `Merchant`
/// interface in `@anton-business/shared-types`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Merchant {
    pub id: String,
    pub wallet_address: String,
    pub legal_name: String,
    pub org_nr: String,
    pub country: String,
    pub city: String,
    pub street: String,
    pub postcode: String,
    pub vat_registered: bool,
    pub approved_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Default)]
pub struct AppState(Arc<Inner>);

#[derive(Debug, Default)]
struct Inner {
    /// merchant_id → Merchant
    merchants_by_id: RwLock<HashMap<String, Merchant>>,
    /// wallet_address → merchant_id (reverse lookup for routes that
    /// path-bind on the wallet address rather than the merchant id)
    address_to_id: RwLock<HashMap<String, String>>,
    /// wallet_address → latest signed delegation. Replacing the entry
    /// supersedes the previous delegation, per ADR-005.
    delegations: RwLock<HashMap<String, SignedDelegation>>,
    /// wallet_address → set of nonces seen for that merchant. Used to
    /// reject delegation replays per ADR-005.
    seen_nonces: RwLock<HashMap<String, HashSet<String>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self(Arc::new(Inner::default()))
    }

    // ── merchants ────────────────────────────────────────────────

    pub fn insert_merchant(&self, m: Merchant) {
        let id = m.id.clone();
        let addr = m.wallet_address.clone();
        self.0.merchants_by_id.write().unwrap().insert(id.clone(), m);
        self.0.address_to_id.write().unwrap().insert(addr, id);
    }

    pub fn merchant_by_id(&self, id: &str) -> Option<Merchant> {
        self.0.merchants_by_id.read().unwrap().get(id).cloned()
    }

    pub fn merchant_by_address(&self, address: &str) -> Option<Merchant> {
        let guard = self.0.address_to_id.read().unwrap();
        let id = guard.get(address)?.clone();
        drop(guard);
        self.merchant_by_id(&id)
    }

    /// True iff a merchant with this id already exists. Used to detect
    /// id collisions during registration.
    pub fn merchant_id_taken(&self, id: &str) -> bool {
        self.0.merchants_by_id.read().unwrap().contains_key(id)
    }

    // ── delegations ──────────────────────────────────────────────

    /// Return the current active delegation for a merchant address.
    pub fn delegation(&self, address: &str) -> Option<SignedDelegation> {
        self.0.delegations.read().unwrap().get(address).cloned()
    }

    /// Mark a nonce as consumed for `address`. Returns true if the
    /// nonce was newly added, false if it was already present (replay).
    pub fn record_nonce(&self, address: &str, nonce: &str) -> bool {
        self.0
            .seen_nonces
            .write()
            .unwrap()
            .entry(address.to_string())
            .or_default()
            .insert(nonce.to_string())
    }

    pub fn save_delegation(&self, address: &str, env: SignedDelegation) {
        self.0
            .delegations
            .write()
            .unwrap()
            .insert(address.to_string(), env);
    }
}
