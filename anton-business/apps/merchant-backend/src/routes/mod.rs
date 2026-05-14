//! HTTP route modules. Each file maps 1:1 to a feature surface, and
//! `build_router()` is the single entry point that wires them all
//! together with the shared `AppState`.

use axum::{Router, routing::{get, post}};

use crate::state::AppState;

pub mod delegation;
pub mod health;
pub mod merchant;
pub mod transactions;

/// Build the full merchant-backend router. `main.rs` consumes this;
/// integration tests `oneshot()` against it.
pub fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health::handler))
        // Merchant lifecycle
        .route("/merchant/register", post(merchant::register))
        .route("/merchant/:id", get(merchant::get_by_id))
        .route("/merchant/by-address/:address", get(merchant::get_by_address))
        // Settlement delegation (ADR-005)
        .route(
            "/merchant/:address/delegate",
            post(delegation::put_delegation).get(delegation::get_delegation),
        )
        // Transaction visibility (placeholders, sprint 1 task 3+)
        .route("/merchant/:address/transactions", get(transactions::list_for_merchant))
        .route("/transaction/:uetr/status", get(transactions::status))
        .with_state(state)
}
