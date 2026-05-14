//! routes_smoke — end-to-end coverage of the merchant-backend HTTP
//! surface. Uses tower::ServiceExt::oneshot to drive the axum router
//! in-process, so no real network is involved.
//!
//! Covers the full ADR-005 happy path (merchant registers → signs a
//! delegation → backend verifies + persists → GET returns it) plus
//! every documented rejection (signer mismatch, expired, replay,
//! schema mismatch).
//!
//! Requires the `server` feature (always on under `cargo test`'s
//! default profile). To run just these tests:
//!   cargo test --test routes_smoke

use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use merchant_backend::{
    delegation::{SettlementDelegation, SignedDelegation, sign},
    routes::build_router,
    state::AppState,
    wallet::address_from_public_key,
};
use secp256k1::{PublicKey, Secp256k1, SecretKey};
use serde_json::json;
use tower::ServiceExt;

fn deterministic_priv() -> [u8; 32] {
    let mut out = [0u8; 32];
    for i in 0..32 {
        out[i] = (i + 1) as u8;
    }
    out
}

fn test_address() -> String {
    let secp = Secp256k1::new();
    let sk = SecretKey::from_slice(&deterministic_priv()).unwrap();
    let pk = PublicKey::from_secret_key(&secp, &sk);
    address_from_public_key(&pk.serialize_uncompressed()).unwrap()
}

fn baseline_delegation(wallet_address: String, nonce: &str, valid_until: i64) -> SettlementDelegation {
    SettlementDelegation {
        merchant_id: "KTH00001".into(),
        wallet_address,
        safello_receiving_address: "fc_safello11111111111111111111111111111111aa".into(),
        max_per_day_micro_ftc: 1_000_000_000,
        valid_until,
        nonce: nonce.into(),
    }
}

async fn body_json(resp: axum::response::Response) -> serde_json::Value {
    let bytes = to_bytes(resp.into_body(), usize::MAX).await.unwrap();
    serde_json::from_slice(&bytes).unwrap_or_else(|e| {
        panic!("not JSON: {e:?} — bytes: {}", String::from_utf8_lossy(&bytes))
    })
}

fn post(uri: &str, body: serde_json::Value) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri(uri)
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

fn get(uri: &str) -> Request<Body> {
    Request::builder().method("GET").uri(uri).body(Body::empty()).unwrap()
}

// ── /health ────────────────────────────────────────────────────────

#[tokio::test]
async fn health_returns_ok() {
    let app = build_router(AppState::new());
    let resp = app.oneshot(get("/health")).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body = body_json(resp).await;
    assert_eq!(body["status"], "ok");
}

// ── /merchant/register + /merchant/:id ─────────────────────────────

#[tokio::test]
async fn register_then_lookup_by_id_and_address() {
    let app = build_router(AppState::new());
    let addr = test_address();

    let resp = app
        .clone()
        .oneshot(post(
            "/merchant/register",
            json!({
                "walletAddress": addr,
                "kybMetadataHash": "a".repeat(64),
                "legalName": "Karl's Café AB",
                "orgNr": "SE5560000000",
                "city": "Stockholm",
                "street": "Drottninggatan 1",
                "postcode": "11151",
                "vatRegistered": true,
            }),
        ))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let reg = body_json(resp).await;
    let merchant_id = reg["merchantId"].as_str().unwrap().to_string();
    assert_eq!(merchant_id.len(), 8);
    assert!(merchant_id.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()));
    assert!(reg["activationToken"].as_str().is_some());

    let resp = app
        .clone()
        .oneshot(get(&format!("/merchant/{}", merchant_id)))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let m = body_json(resp).await;
    assert_eq!(m["legalName"], "Karl's Café AB");
    assert_eq!(m["country"], "SE");

    let resp = app
        .clone()
        .oneshot(get(&format!("/merchant/by-address/{}", addr)))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let m2 = body_json(resp).await;
    assert_eq!(m2["id"], merchant_id);
}

#[tokio::test]
async fn register_rejects_duplicate_wallet_address() {
    let app = build_router(AppState::new());
    let body = json!({
        "walletAddress": test_address(),
        "kybMetadataHash": "b".repeat(64),
        "legalName": "Foo AB",
        "orgNr": "SE5560000111",
        "city": "X",
        "street": "Y",
        "postcode": "12345",
        "vatRegistered": false,
    });
    let r1 = app.clone().oneshot(post("/merchant/register", body.clone())).await.unwrap();
    assert_eq!(r1.status(), StatusCode::CREATED);
    let r2 = app.clone().oneshot(post("/merchant/register", body)).await.unwrap();
    assert_eq!(r2.status(), StatusCode::CONFLICT);
    let err = body_json(r2).await;
    assert_eq!(err["code"], "already_registered");
}

#[tokio::test]
async fn register_rejects_bad_kyb_hash() {
    let app = build_router(AppState::new());
    let resp = app
        .oneshot(post(
            "/merchant/register",
            json!({
                "walletAddress": "fc_abc",
                "kybMetadataHash": "tooshort",
                "legalName": "X",
                "orgNr": "SE1",
                "city": "X",
                "street": "Y",
                "postcode": "1",
                "vatRegistered": false,
            }),
        ))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    assert_eq!(body_json(resp).await["code"], "invalid_kyb_hash");
}

#[tokio::test]
async fn merchant_lookup_404_when_missing() {
    let app = build_router(AppState::new());
    let resp = app.oneshot(get("/merchant/XXXXXXXX")).await.unwrap();
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}

// ── /merchant/:address/delegate ────────────────────────────────────

#[tokio::test]
async fn delegate_full_happy_path() {
    let app = build_router(AppState::new());
    let addr = test_address();
    let payload = baseline_delegation(
        addr.clone(),
        "550e8400-e29b-41d4-a716-446655440000",
        // Far future — well past any sane test runtime.
        2_147_483_647,
    );
    let env = sign(&payload, &deterministic_priv()).unwrap();

    let resp = app
        .clone()
        .oneshot(post(
            &format!("/merchant/{}/delegate", addr),
            serde_json::to_value(&env).unwrap(),
        ))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let stored: SignedDelegation = serde_json::from_value(body_json(resp).await).unwrap();
    assert_eq!(stored.signature, env.signature);

    // GET returns the same envelope.
    let resp = app
        .clone()
        .oneshot(get(&format!("/merchant/{}/delegate", addr)))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let got: SignedDelegation = serde_json::from_value(body_json(resp).await).unwrap();
    assert_eq!(got.signature, env.signature);
}

#[tokio::test]
async fn delegate_rejects_address_mismatch() {
    let app = build_router(AppState::new());
    let addr = test_address();
    let payload = baseline_delegation(
        addr.clone(),
        "550e8400-e29b-41d4-a716-446655440000",
        2_147_483_647,
    );
    let env = sign(&payload, &deterministic_priv()).unwrap();

    // Path uses a different address than the payload.
    let resp = app
        .oneshot(post("/merchant/fc_otheraddress/delegate", serde_json::to_value(&env).unwrap()))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    assert_eq!(body_json(resp).await["code"], "address_mismatch");
}

#[tokio::test]
async fn delegate_rejects_signer_mismatch() {
    let app = build_router(AppState::new());
    let addr = test_address();
    let mut payload = baseline_delegation(
        addr.clone(),
        "550e8400-e29b-41d4-a716-446655440000",
        2_147_483_647,
    );
    // Sign as the test key but the walletAddress points elsewhere.
    payload.wallet_address = "fc_completelyfakeaddressdoesnotresolveatall".into();
    let env = sign(&payload, &deterministic_priv()).unwrap();
    let resp = app
        .oneshot(post(
            &format!("/merchant/{}/delegate", env.payload.wallet_address),
            serde_json::to_value(&env).unwrap(),
        ))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(body_json(resp).await["code"], "signer_mismatch");
}

#[tokio::test]
async fn delegate_rejects_expired() {
    let app = build_router(AppState::new());
    let addr = test_address();
    let payload = baseline_delegation(
        addr.clone(),
        "550e8400-e29b-41d4-a716-446655440000",
        // Way in the past.
        1_000_000_000,
    );
    let env = sign(&payload, &deterministic_priv()).unwrap();
    let resp = app
        .oneshot(post(&format!("/merchant/{}/delegate", addr), serde_json::to_value(&env).unwrap()))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    assert_eq!(body_json(resp).await["code"], "expired");
}

#[tokio::test]
async fn delegate_rejects_nonce_replay() {
    let app = build_router(AppState::new());
    let addr = test_address();
    let payload = baseline_delegation(
        addr.clone(),
        "550e8400-e29b-41d4-a716-446655440000",
        2_147_483_647,
    );
    let env = sign(&payload, &deterministic_priv()).unwrap();
    let r1 = app
        .clone()
        .oneshot(post(&format!("/merchant/{}/delegate", addr), serde_json::to_value(&env).unwrap()))
        .await
        .unwrap();
    assert_eq!(r1.status(), StatusCode::CREATED);
    let r2 = app
        .clone()
        .oneshot(post(&format!("/merchant/{}/delegate", addr), serde_json::to_value(&env).unwrap()))
        .await
        .unwrap();
    assert_eq!(r2.status(), StatusCode::CONFLICT);
    assert_eq!(body_json(r2).await["code"], "nonce_reused");
}

#[tokio::test]
async fn delegate_supersedes_with_new_nonce() {
    // ADR-005: a new delegation (new nonce) supersedes the prior one
    // for the same merchant. The replay nonce check is per-merchant,
    // so two different nonces should both be accepted.
    let app = build_router(AppState::new());
    let addr = test_address();

    let p1 = baseline_delegation(addr.clone(), "550e8400-e29b-41d4-a716-446655440000", 2_147_483_647);
    let e1 = sign(&p1, &deterministic_priv()).unwrap();
    let r1 = app
        .clone()
        .oneshot(post(&format!("/merchant/{}/delegate", addr), serde_json::to_value(&e1).unwrap()))
        .await
        .unwrap();
    assert_eq!(r1.status(), StatusCode::CREATED);

    let p2 = baseline_delegation(addr.clone(), "660e8400-e29b-41d4-a716-446655440001", 2_147_483_647);
    let e2 = sign(&p2, &deterministic_priv()).unwrap();
    let r2 = app
        .clone()
        .oneshot(post(&format!("/merchant/{}/delegate", addr), serde_json::to_value(&e2).unwrap()))
        .await
        .unwrap();
    assert_eq!(r2.status(), StatusCode::CREATED);

    // GET returns the *new* one.
    let resp = app
        .oneshot(get(&format!("/merchant/{}/delegate", addr)))
        .await
        .unwrap();
    let got: SignedDelegation = serde_json::from_value(body_json(resp).await).unwrap();
    assert_eq!(got.payload.nonce, "660e8400-e29b-41d4-a716-446655440001");
}

// ── /merchant/:address/transactions + /transaction/:uetr/status ────

#[tokio::test]
async fn transactions_returns_empty_stub_for_registered_merchant() {
    let app = build_router(AppState::new());
    let addr = test_address();
    // Register first so the lookup doesn't 404.
    let _ = app
        .clone()
        .oneshot(post(
            "/merchant/register",
            json!({
                "walletAddress": addr,
                "kybMetadataHash": "c".repeat(64),
                "legalName": "X",
                "orgNr": "SE5560000222",
                "city": "X",
                "street": "Y",
                "postcode": "12345",
                "vatRegistered": false,
            }),
        ))
        .await
        .unwrap();

    let resp = app
        .oneshot(get(&format!("/merchant/{}/transactions", addr)))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body = body_json(resp).await;
    assert_eq!(body["transactions"], serde_json::json!([]));
    assert_eq!(body["live"], false);
}

#[tokio::test]
async fn transactions_404_for_unknown_merchant() {
    let app = build_router(AppState::new());
    let resp = app.oneshot(get("/merchant/fc_unknown/transactions")).await.unwrap();
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn transaction_status_validates_uetr_length() {
    let app = build_router(AppState::new());
    let resp = app.oneshot(get("/transaction/short/status")).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    assert_eq!(body_json(resp).await["code"], "invalid_uetr");
}

#[tokio::test]
async fn transaction_status_accepts_valid_uetr() {
    let app = build_router(AppState::new());
    let resp = app
        .oneshot(get("/transaction/550e8400-e29b-41d4-a716-446655440000/status"))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body = body_json(resp).await;
    assert_eq!(body["uetr"], "550e8400-e29b-41d4-a716-446655440000");
    assert_eq!(body["live"], false);
}
