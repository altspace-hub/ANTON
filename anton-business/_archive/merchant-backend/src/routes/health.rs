//! GET /health — liveness probe. Always 200 OK when the process is up.
//! Sprint 1 will add /ready that also checks DB + RPC reachability.

use axum::{http::StatusCode, response::IntoResponse, Json};
use serde_json::json;

pub async fn handler() -> impl IntoResponse {
    (
        StatusCode::OK,
        Json(json!({
            "status": "ok",
            "service": "merchant-backend",
            "version": env!("CARGO_PKG_VERSION"),
        })),
    )
}
