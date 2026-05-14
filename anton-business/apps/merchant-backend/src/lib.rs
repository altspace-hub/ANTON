//! merchant-backend — library surface.
//!
//! The same Cargo package builds both a library (this file) and a
//! binary (main.rs). The library contains the pure-logic modules
//! (reference, delegation, wallet) that have no I/O dependency and
//! must be byte-for-byte compatible with the TypeScript
//! `@futurechain/sdk`. The binary contains the HTTP server.
//!
//! Split into separate features so a fast `cargo test --lib
//! --no-default-features` test loop is possible without compiling
//! axum / sqlx / tokio-full for every change.

pub mod reference;
pub mod delegation;
pub mod wallet;
