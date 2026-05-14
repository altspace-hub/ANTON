//! state — shared application state for route handlers.
//!
//! `Storage` is the async trait that handlers depend on; `AppState`
//! wraps `Arc<dyn Storage>` so the same handlers work against either
//! the in-memory backend (used in tests) or the Postgres backend
//! (used by main.rs).
//!
//! Two backends:
//!   - `InMemoryStorage`  Arc<RwLock<HashMap>>, no I/O. Default for
//!                        tests so they stay sub-millisecond.
//!   - `PostgresStorage`  sqlx::PgPool. Used in production via
//!                        `AppState::postgres(pool)`.
//!
//! Both must agree on every observable behaviour — the route
//! integration tests run against InMemory but the contract is
//! identical, so a follow-on commit can run the same suite against
//! Postgres (with testcontainers).

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::delegation::SignedDelegation;

/// A registered merchant. Wire shape matches the TS `Merchant` interface.
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

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("storage backend error: {0}")]
    Backend(String),
}

/// The storage abstraction the handlers depend on. Both backends
/// implement this; AppState wraps `Arc<dyn Storage>`.
#[async_trait]
pub trait Storage: Send + Sync + 'static {
    async fn insert_merchant(&self, m: Merchant) -> Result<(), StorageError>;
    async fn merchant_by_id(&self, id: &str) -> Result<Option<Merchant>, StorageError>;
    async fn merchant_by_address(&self, address: &str) -> Result<Option<Merchant>, StorageError>;
    async fn merchant_id_taken(&self, id: &str) -> Result<bool, StorageError>;

    async fn current_delegation(&self, address: &str) -> Result<Option<SignedDelegation>, StorageError>;
    async fn save_delegation(&self, address: &str, env: SignedDelegation) -> Result<(), StorageError>;

    /// Returns true if the nonce was newly added; false if it was
    /// already present (replay).
    async fn record_nonce(&self, address: &str, nonce: &str) -> Result<bool, StorageError>;
}

#[derive(Clone)]
pub struct AppState(Arc<dyn Storage>);

impl AppState {
    /// In-memory backend — default for tests.
    pub fn in_memory() -> Self {
        AppState(Arc::new(InMemoryStorage::default()))
    }

    /// Wrap a pre-built storage backend. Used by main.rs to inject
    /// PostgresStorage, and by integration tests that need to peek at
    /// the in-memory state.
    pub fn from_storage(s: Arc<dyn Storage>) -> Self {
        AppState(s)
    }
}

impl std::ops::Deref for AppState {
    type Target = dyn Storage;
    fn deref(&self) -> &Self::Target {
        &*self.0
    }
}

impl std::fmt::Debug for AppState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AppState").finish_non_exhaustive()
    }
}

// ── In-memory backend ─────────────────────────────────────────────

#[derive(Debug, Default)]
pub struct InMemoryStorage {
    merchants_by_id: RwLock<HashMap<String, Merchant>>,
    address_to_id: RwLock<HashMap<String, String>>,
    delegations: RwLock<HashMap<String, SignedDelegation>>,
    seen_nonces: RwLock<HashMap<String, HashSet<String>>>,
}

#[async_trait]
impl Storage for InMemoryStorage {
    async fn insert_merchant(&self, m: Merchant) -> Result<(), StorageError> {
        let id = m.id.clone();
        let addr = m.wallet_address.clone();
        self.merchants_by_id.write().unwrap().insert(id.clone(), m);
        self.address_to_id.write().unwrap().insert(addr, id);
        Ok(())
    }

    async fn merchant_by_id(&self, id: &str) -> Result<Option<Merchant>, StorageError> {
        Ok(self.merchants_by_id.read().unwrap().get(id).cloned())
    }

    async fn merchant_by_address(&self, address: &str) -> Result<Option<Merchant>, StorageError> {
        let id = match self.address_to_id.read().unwrap().get(address) {
            Some(id) => id.clone(),
            None => return Ok(None),
        };
        Ok(self.merchants_by_id.read().unwrap().get(&id).cloned())
    }

    async fn merchant_id_taken(&self, id: &str) -> Result<bool, StorageError> {
        Ok(self.merchants_by_id.read().unwrap().contains_key(id))
    }

    async fn current_delegation(&self, address: &str) -> Result<Option<SignedDelegation>, StorageError> {
        Ok(self.delegations.read().unwrap().get(address).cloned())
    }

    async fn save_delegation(&self, address: &str, env: SignedDelegation) -> Result<(), StorageError> {
        self.delegations.write().unwrap().insert(address.to_string(), env);
        Ok(())
    }

    async fn record_nonce(&self, address: &str, nonce: &str) -> Result<bool, StorageError> {
        Ok(self
            .seen_nonces
            .write()
            .unwrap()
            .entry(address.to_string())
            .or_default()
            .insert(nonce.to_string()))
    }
}

// ── Postgres backend (compiled only with `db` feature) ─────────────

#[cfg(feature = "db")]
pub mod pg {
    use super::*;
    use bigdecimal::BigDecimal;
    use sqlx::PgPool;
    use std::str::FromStr;

    #[derive(Clone)]
    pub struct PostgresStorage {
        pool: PgPool,
    }

    impl PostgresStorage {
        pub fn new(pool: PgPool) -> Self {
            Self { pool }
        }

        /// Run pending migrations from `migrations/` against the pool.
        /// Idempotent; call at startup.
        pub async fn migrate(&self) -> Result<(), sqlx::migrate::MigrateError> {
            sqlx::migrate!("./migrations").run(&self.pool).await
        }
    }

    fn map<T>(r: Result<T, sqlx::Error>) -> Result<T, StorageError> {
        r.map_err(|e| StorageError::Backend(e.to_string()))
    }

    #[async_trait]
    impl Storage for PostgresStorage {
        async fn insert_merchant(&self, m: Merchant) -> Result<(), StorageError> {
            map(sqlx::query(
                "INSERT INTO merchants
                 (id, wallet_address, legal_name, org_nr, country, city,
                  street, postcode, vat_registered, approved_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)")
                .bind(&m.id)
                .bind(&m.wallet_address)
                .bind(&m.legal_name)
                .bind(&m.org_nr)
                .bind(&m.country)
                .bind(&m.city)
                .bind(&m.street)
                .bind(&m.postcode)
                .bind(m.vat_registered)
                .bind(m.approved_at)
                .execute(&self.pool)
                .await
                .map(|_| ()))
        }

        async fn merchant_by_id(&self, id: &str) -> Result<Option<Merchant>, StorageError> {
            let row = map(sqlx::query_as::<_, MerchantRow>(
                "SELECT id, wallet_address, legal_name, org_nr, country, city,
                        street, postcode, vat_registered, approved_at
                 FROM merchants WHERE id = $1")
                .bind(id)
                .fetch_optional(&self.pool)
                .await)?;
            Ok(row.map(Into::into))
        }

        async fn merchant_by_address(&self, address: &str) -> Result<Option<Merchant>, StorageError> {
            let row = map(sqlx::query_as::<_, MerchantRow>(
                "SELECT id, wallet_address, legal_name, org_nr, country, city,
                        street, postcode, vat_registered, approved_at
                 FROM merchants WHERE wallet_address = $1")
                .bind(address)
                .fetch_optional(&self.pool)
                .await)?;
            Ok(row.map(Into::into))
        }

        async fn merchant_id_taken(&self, id: &str) -> Result<bool, StorageError> {
            let count: i64 = map(sqlx::query_scalar(
                "SELECT COUNT(*) FROM merchants WHERE id = $1")
                .bind(id)
                .fetch_one(&self.pool)
                .await)?;
            Ok(count > 0)
        }

        async fn current_delegation(&self, address: &str) -> Result<Option<SignedDelegation>, StorageError> {
            let row = map(sqlx::query_as::<_, DelegationRow>(
                "SELECT wallet_address, schema_version, merchant_id,
                        safello_receiving_address, max_per_day_micro_ftc,
                        valid_until, nonce, signature
                 FROM delegations WHERE wallet_address = $1")
                .bind(address)
                .fetch_optional(&self.pool)
                .await)?;
            Ok(row.map(Into::into))
        }

        async fn save_delegation(&self, address: &str, env: SignedDelegation) -> Result<(), StorageError> {
            let cap = BigDecimal::from_str(&env.payload.max_per_day_micro_ftc.to_string())
                .map_err(|e| StorageError::Backend(format!("bad bigdecimal: {e}")))?;
            map(sqlx::query(
                "INSERT INTO delegations
                 (wallet_address, schema_version, merchant_id,
                  safello_receiving_address, max_per_day_micro_ftc,
                  valid_until, nonce, signature)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (wallet_address) DO UPDATE SET
                   schema_version = EXCLUDED.schema_version,
                   merchant_id = EXCLUDED.merchant_id,
                   safello_receiving_address = EXCLUDED.safello_receiving_address,
                   max_per_day_micro_ftc = EXCLUDED.max_per_day_micro_ftc,
                   valid_until = EXCLUDED.valid_until,
                   nonce = EXCLUDED.nonce,
                   signature = EXCLUDED.signature,
                   created_at = NOW()")
                .bind(address)
                .bind(&env.schema_version)
                .bind(&env.payload.merchant_id)
                .bind(&env.payload.safello_receiving_address)
                .bind(&cap)
                .bind(env.payload.valid_until)
                .bind(&env.payload.nonce)
                .bind(&env.signature)
                .execute(&self.pool)
                .await
                .map(|_| ()))
        }

        async fn record_nonce(&self, address: &str, nonce: &str) -> Result<bool, StorageError> {
            // Race-free atomic insert. Returns 1 row if newly added,
            // 0 if it conflicted with an existing row → caller
            // interprets 0 as "replay".
            let result = map(sqlx::query(
                "INSERT INTO seen_nonces (wallet_address, nonce) VALUES ($1, $2)
                 ON CONFLICT (wallet_address, nonce) DO NOTHING")
                .bind(address)
                .bind(nonce)
                .execute(&self.pool)
                .await)?;
            Ok(result.rows_affected() == 1)
        }
    }

    // ── Row types ───────────────────────────────────────────────────

    #[derive(sqlx::FromRow)]
    struct MerchantRow {
        id: String,
        wallet_address: String,
        legal_name: String,
        org_nr: String,
        country: String,
        city: String,
        street: String,
        postcode: String,
        vat_registered: bool,
        approved_at: DateTime<Utc>,
    }

    impl From<MerchantRow> for Merchant {
        fn from(r: MerchantRow) -> Self {
            Merchant {
                id: r.id,
                wallet_address: r.wallet_address,
                legal_name: r.legal_name,
                org_nr: r.org_nr,
                country: r.country,
                city: r.city,
                street: r.street,
                postcode: r.postcode,
                vat_registered: r.vat_registered,
                approved_at: r.approved_at,
            }
        }
    }

    #[derive(sqlx::FromRow)]
    struct DelegationRow {
        wallet_address: String,
        schema_version: String,
        merchant_id: String,
        safello_receiving_address: String,
        max_per_day_micro_ftc: BigDecimal,
        valid_until: i64,
        nonce: String,
        signature: String,
    }

    impl From<DelegationRow> for SignedDelegation {
        fn from(r: DelegationRow) -> Self {
            // BigDecimal -> u128 via its string form. The NUMERIC(39, 0)
            // column always fits in u128 (max u128 = 39 digits).
            let cap_str = r.max_per_day_micro_ftc.to_string();
            // Strip a trailing ".0" if BigDecimal added it (it doesn't
            // for integer values, but defensive).
            let cap_str = cap_str.trim_end_matches('0').trim_end_matches('.');
            let cap = if cap_str.is_empty() { 0u128 } else { cap_str.parse::<u128>().unwrap_or(0) };
            SignedDelegation {
                schema_version: r.schema_version,
                payload: crate::delegation::SettlementDelegation {
                    merchant_id: r.merchant_id,
                    wallet_address: r.wallet_address,
                    safello_receiving_address: r.safello_receiving_address,
                    max_per_day_micro_ftc: cap,
                    valid_until: r.valid_until,
                    nonce: r.nonce,
                },
                signature: r.signature,
            }
        }
    }
}
