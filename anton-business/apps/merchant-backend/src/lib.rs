//! merchant-backend — library surface.
//!
//! The same Cargo package builds both a library (this file) and a
//! binary (main.rs). The library hosts:
//!
//!   - The pure-logic modules (reference, delegation, wallet) that
//!     must be byte-for-byte compatible with `@futurechain/sdk` and
//!     are tested via `cargo test --lib --no-default-features`.
//!   - The shared application state and API error envelope.
//!   - Under the `server` feature: the route handler modules and the
//!     `build_router()` function.

pub mod reference;
pub mod delegation;
pub mod wallet;

#[cfg(feature = "server")]
pub mod api_error;
#[cfg(feature = "server")]
pub mod routes;
#[cfg(feature = "server")]
pub mod state;
