//! reference — PACS.008 remittance field encoder/decoder.
//!
//! Implements ADR-004 (see anton-business/docs/adr/). Byte-for-byte
//! compatible with `@futurechain/sdk/reference` — the TS side generates
//! `tests/fixtures/reference.json` and Rust must produce identical
//! output.
//!
//! Pure module: no I/O, no async, no global state.

use serde::{Deserialize, Serialize};

/// v1 purpose codes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum V1Purpose {
    Retail,
    Restaurant,
    Event,
    Service,
    Refund,
}

impl V1Purpose {
    fn as_str(&self) -> &'static str {
        match self {
            V1Purpose::Retail => "RETAIL",
            V1Purpose::Restaurant => "RESTAURANT",
            V1Purpose::Event => "EVENT",
            V1Purpose::Service => "SERVICE",
            V1Purpose::Refund => "REFUND",
        }
    }
    fn from_str(s: &str) -> Option<V1Purpose> {
        match s {
            "RETAIL" => Some(V1Purpose::Retail),
            "RESTAURANT" => Some(V1Purpose::Restaurant),
            "EVENT" => Some(V1Purpose::Event),
            "SERVICE" => Some(V1Purpose::Service),
            "REFUND" => Some(V1Purpose::Refund),
            _ => None,
        }
    }
}

/// v1 — merchant-bearing schema fields.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct V1Fields {
    pub merchant_id: String,
    pub order_id: String,
    pub purpose: V1Purpose,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub item_count: Option<u16>,
    /// Stored as decimal string in JSON for cross-language portability.
    #[serde(skip_serializing_if = "Option::is_none", default, with = "u128_option_str")]
    pub vat_micro_units: Option<u128>,
    #[serde(skip_serializing_if = "Option::is_none", default, with = "u128_option_str")]
    pub discount_micro_units: Option<u128>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub refund_of: Option<String>,
}

/// v2 — operational schema (existing ANTON gateway).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct V2Fields {
    pub purpose: String,
    pub nature: String,
    pub goal: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub task_ref: Option<String>,
}

/// Tagged union returned by `decode()`. Mirrors the TS `DecodeResult`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum DecodeResult {
    V1 { fields: V1Fields },
    V2 { fields: V2Fields },
    UnversionedV2 { fields: V2Fields },
    Unknown { raw: String },
    Invalid { reason: String },
}

pub const REMITTANCE_MAX_LEN: usize = 140;

#[derive(Debug, thiserror::Error)]
pub enum EncodeError {
    #[error("validation failed on {field}: {reason}")]
    Validation { field: &'static str, reason: String },
    #[error("reference exceeds {} chars (got {got})", REMITTANCE_MAX_LEN)]
    TooLong { got: usize },
}

// ── Encoder ─────────────────────────────────────────────────────────

/// Encode `V1Fields` into a `v1:`-prefixed remittance string ≤ 140 chars.
pub fn encode_v1(input: &V1Fields) -> Result<String, EncodeError> {
    if !is_merchant_id(&input.merchant_id) {
        return Err(EncodeError::Validation { field: "merchantId", reason: "must match /^[A-Z0-9]{8}$/".into() });
    }
    if !is_order_id(&input.order_id) {
        return Err(EncodeError::Validation { field: "orderId", reason: "must match /^[A-Z0-9]{12}$/".into() });
    }
    match (input.purpose, input.refund_of.is_some()) {
        (V1Purpose::Refund, false) => {
            return Err(EncodeError::Validation { field: "refundOf", reason: "required when purpose === REFUND".into() });
        }
        (p, true) if p != V1Purpose::Refund => {
            return Err(EncodeError::Validation { field: "refundOf", reason: "prohibited unless purpose === REFUND".into() });
        }
        _ => {}
    }
    if let Some(c) = input.item_count {
        if c > 999 {
            return Err(EncodeError::Validation { field: "itemCount", reason: "must be in [0, 999]".into() });
        }
    }
    if let Some(v) = input.vat_micro_units {
        if v >= 10u128.pow(18) {
            return Err(EncodeError::Validation { field: "vatMicroUnits", reason: "must be in [0, 10^18)".into() });
        }
    }
    if let Some(v) = input.discount_micro_units {
        if v >= 10u128.pow(18) {
            return Err(EncodeError::Validation { field: "discountMicroUnits", reason: "must be in [0, 10^18)".into() });
        }
    }
    if let Some(r) = &input.refund_of {
        if !is_uetr(r) {
            return Err(EncodeError::Validation { field: "refundOf", reason: "must be a lowercase UUIDv4".into() });
        }
    }

    let mut out = format!("v1: M:{} O:{} P:{}", input.merchant_id, input.order_id, input.purpose.as_str());
    if let Some(c) = input.item_count { out.push_str(&format!(" I:{}", c)); }
    if let Some(v) = input.vat_micro_units { out.push_str(&format!(" V:{}", v)); }
    if let Some(d) = input.discount_micro_units { out.push_str(&format!(" D:{}", d)); }
    if let Some(r) = &input.refund_of { out.push_str(&format!(" R:{}", r)); }

    if out.len() > REMITTANCE_MAX_LEN {
        return Err(EncodeError::TooLong { got: out.len() });
    }
    Ok(out)
}

// ── Decoder ─────────────────────────────────────────────────────────

/// Decode a remittance string into a `DecodeResult`. Never panics.
/// Returns `DecodeResult::Unknown` for free-text inputs and
/// `DecodeResult::Invalid` for inputs whose version is recognised but
/// whose body is malformed.
pub fn decode(remittance: &str) -> DecodeResult {
    if remittance.len() > REMITTANCE_MAX_LEN {
        return DecodeResult::Invalid {
            reason: format!("exceeds {REMITTANCE_MAX_LEN} chars"),
        };
    }
    if let Some(body) = remittance.strip_prefix("v1: ") {
        return decode_v1_body(body);
    }
    if let Some(body) = remittance.strip_prefix("v2: ") {
        return decode_v2_body(body, false);
    }
    if is_unversioned_v2_hint(remittance) {
        let r = decode_v2_body(remittance, true);
        // ADR-004: prefer Unknown over Invalid for ambiguous cases.
        return match r {
            DecodeResult::Invalid { .. } => DecodeResult::Unknown { raw: remittance.into() },
            other => other,
        };
    }
    DecodeResult::Unknown { raw: remittance.into() }
}

fn decode_v1_body(body: &str) -> DecodeResult {
    let tokens: Vec<&str> = match tokenise(body) {
        Ok(t) => t,
        Err(reason) => return DecodeResult::Invalid { reason },
    };

    let mut iter = tokens.iter();
    let (mut m, mut o, mut p): (Option<&str>, Option<&str>, Option<&str>) = (None, None, None);
    for (idx, expected) in ["M", "O", "P"].iter().enumerate() {
        let t = match iter.next() {
            Some(t) => t,
            None => return DecodeResult::Invalid { reason: "required tokens must appear in order M O P".into() },
        };
        match parse_token(t) {
            Some((tag, val)) if tag == *expected => match idx {
                0 => m = Some(val),
                1 => o = Some(val),
                _ => p = Some(val),
            },
            _ => return DecodeResult::Invalid { reason: "required tokens must appear in order M O P".into() },
        }
    }
    let (m, o, p) = (m.unwrap(), o.unwrap(), p.unwrap());

    if !is_merchant_id(m) {
        return DecodeResult::Invalid { reason: "malformed merchantId".into() };
    }
    if !is_order_id(o) {
        return DecodeResult::Invalid { reason: "malformed orderId".into() };
    }
    let purpose = match V1Purpose::from_str(p) {
        Some(p) => p,
        None => return DecodeResult::Invalid { reason: format!("unknown purpose \"{p}\"") },
    };

    let mut fields = V1Fields {
        merchant_id: m.to_string(),
        order_id: o.to_string(),
        purpose,
        item_count: None,
        vat_micro_units: None,
        discount_micro_units: None,
        refund_of: None,
    };
    let mut seen_optional: std::collections::HashSet<&str> = Default::default();
    for t in iter {
        let (tag, val) = match parse_token(t) {
            Some(p) => p,
            None => return DecodeResult::Invalid { reason: format!("malformed token \"{t}\"") },
        };
        if !["I", "V", "D", "R"].contains(&tag) {
            return DecodeResult::Invalid { reason: format!("unknown tag \"{tag}\" in v1") };
        }
        if !seen_optional.insert(tag) {
            return DecodeResult::Invalid { reason: format!("duplicate tag \"{tag}\"") };
        }
        match tag {
            "I" => match val.parse::<u16>() {
                Ok(n) if n <= 999 && (val == "0" || !val.starts_with('0')) => fields.item_count = Some(n),
                _ => return DecodeResult::Invalid { reason: "malformed itemCount".into() },
            },
            "V" => match val.parse::<u128>() {
                Ok(n) if n < 10u128.pow(18) && (val == "0" || !val.starts_with('0')) => fields.vat_micro_units = Some(n),
                _ => return DecodeResult::Invalid { reason: "malformed vat".into() },
            },
            "D" => match val.parse::<u128>() {
                Ok(n) if n < 10u128.pow(18) && (val == "0" || !val.starts_with('0')) => fields.discount_micro_units = Some(n),
                _ => return DecodeResult::Invalid { reason: "malformed discount".into() },
            },
            "R" => {
                if !is_uetr(val) {
                    return DecodeResult::Invalid { reason: "malformed refundOf UETR".into() };
                }
                fields.refund_of = Some(val.to_string());
            }
            _ => unreachable!(),
        }
    }

    if purpose == V1Purpose::Refund && fields.refund_of.is_none() {
        return DecodeResult::Invalid { reason: "REFUND purpose requires R: tag".into() };
    }
    if purpose != V1Purpose::Refund && fields.refund_of.is_some() {
        return DecodeResult::Invalid { reason: "R: tag only allowed with REFUND purpose".into() };
    }

    DecodeResult::V1 { fields }
}

fn decode_v2_body(body: &str, unversioned: bool) -> DecodeResult {
    let tokens: Vec<&str> = match tokenise(body) {
        Ok(t) => t,
        Err(reason) => return DecodeResult::Invalid { reason },
    };

    let mut iter = tokens.iter();
    let (mut p, mut n, mut g): (Option<&str>, Option<&str>, Option<&str>) = (None, None, None);
    for (idx, expected) in ["P", "N", "G"].iter().enumerate() {
        let t = match iter.next() {
            Some(t) => t,
            None => return DecodeResult::Invalid { reason: "required tokens must appear in order P N G".into() },
        };
        match parse_token(t) {
            Some((tag, val)) if tag == *expected => match idx {
                0 => p = Some(val),
                1 => n = Some(val),
                _ => g = Some(val),
            },
            _ => return DecodeResult::Invalid { reason: "required tokens must appear in order P N G".into() },
        }
    }
    let (p, n, g) = (p.unwrap(), n.unwrap(), g.unwrap());

    if !is_iso_purpose(p) {
        return DecodeResult::Invalid { reason: "purpose must be 4 uppercase letters".into() };
    }
    if !is_v2_tag_value(n) {
        return DecodeResult::Invalid { reason: "malformed nature".into() };
    }
    if !is_v2_tag_value(g) {
        return DecodeResult::Invalid { reason: "malformed goal".into() };
    }

    let mut fields = V2Fields {
        purpose: p.into(),
        nature: n.into(),
        goal: g.into(),
        task_ref: None,
    };
    let mut seen_t = false;
    for t in iter {
        let (tag, val) = match parse_token(t) {
            Some(p) => p,
            None => return DecodeResult::Invalid { reason: format!("malformed token \"{t}\"") },
        };
        if tag != "T" {
            return DecodeResult::Invalid { reason: format!("unknown tag \"{tag}\" in v2") };
        }
        if seen_t {
            return DecodeResult::Invalid { reason: "duplicate tag \"T\"".into() };
        }
        if !is_v2_tag_value(val) {
            return DecodeResult::Invalid { reason: "malformed taskRef".into() };
        }
        fields.task_ref = Some(val.to_string());
        seen_t = true;
    }

    if unversioned { DecodeResult::UnversionedV2 { fields } } else { DecodeResult::V2 { fields } }
}

// ── Helpers ─────────────────────────────────────────────────────────

fn tokenise(body: &str) -> Result<Vec<&str>, String> {
    if body.is_empty() {
        return Err("empty body".into());
    }
    let tokens: Vec<&str> = body.split(' ').collect();
    for t in &tokens {
        if t.is_empty() {
            return Err("empty token (consecutive spaces?)".into());
        }
        if t.len() < 3 || t.as_bytes().get(1) != Some(&b':') {
            return Err(format!("malformed token \"{t}\""));
        }
    }
    Ok(tokens)
}

fn parse_token(t: &str) -> Option<(&str, &str)> {
    if t.len() < 3 || t.as_bytes().get(1) != Some(&b':') {
        return None;
    }
    Some((&t[..1], &t[2..]))
}

fn is_merchant_id(s: &str) -> bool {
    s.len() == 8 && s.bytes().all(|b| b.is_ascii_uppercase() || b.is_ascii_digit())
}

fn is_order_id(s: &str) -> bool {
    s.len() == 12 && s.bytes().all(|b| b.is_ascii_uppercase() || b.is_ascii_digit())
}

fn is_iso_purpose(s: &str) -> bool {
    s.len() == 4 && s.bytes().all(|b| b.is_ascii_uppercase())
}

fn is_v2_tag_value(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 32
        && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

fn is_uetr(s: &str) -> bool {
    // 8-4-4-4-12 lowercase hex pattern
    let bytes = s.as_bytes();
    if bytes.len() != 36 { return false; }
    for (i, b) in bytes.iter().enumerate() {
        match i {
            8 | 13 | 18 | 23 => if *b != b'-' { return false; },
            _ => if !is_hex_lower(*b) { return false; },
        }
    }
    true
}

fn is_hex_lower(b: u8) -> bool {
    b.is_ascii_digit() || (b'a'..=b'f').contains(&b)
}

fn is_unversioned_v2_hint(s: &str) -> bool {
    // Mirrors the TS UNVERSIONED_V2_HINT_RE: /^P:[A-Z]{4}( |$)/
    let bytes = s.as_bytes();
    bytes.len() >= 6
        && &bytes[..2] == b"P:"
        && bytes[2..6].iter().all(|b| b.is_ascii_uppercase())
        && (bytes.len() == 6 || bytes[6] == b' ')
}

// ── u128 ↔ JSON decimal string serializer ───────────────────────────
//
// JSON can't represent u128 natively. The TS side emits these fields
// as JSON strings ("12500000"). The Rust side must read/write the same
// shape for cross-language fixtures to compare equal.

mod u128_option_str {
    use serde::{Deserialize, Deserializer, Serializer};
    pub fn serialize<S: Serializer>(v: &Option<u128>, ser: S) -> Result<S::Ok, S::Error> {
        match v {
            Some(n) => ser.serialize_str(&n.to_string()),
            None => ser.serialize_none(),
        }
    }
    pub fn deserialize<'de, D: Deserializer<'de>>(de: D) -> Result<Option<u128>, D::Error> {
        let opt: Option<String> = Option::deserialize(de)?;
        match opt {
            Some(s) => s.parse::<u128>().map(Some).map_err(serde::de::Error::custom),
            None => Ok(None),
        }
    }
}

// ── Tests ───────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn baseline() -> V1Fields {
        V1Fields {
            merchant_id: "KTH00001".into(),
            order_id: "A1B2C3D4E5F6".into(),
            purpose: V1Purpose::Retail,
            item_count: None,
            vat_micro_units: None,
            discount_micro_units: None,
            refund_of: None,
        }
    }

    #[test]
    fn encode_simple_retail() {
        let out = encode_v1(&baseline()).unwrap();
        assert_eq!(out, "v1: M:KTH00001 O:A1B2C3D4E5F6 P:RETAIL");
    }

    #[test]
    fn encode_with_vat_and_items() {
        let mut f = baseline();
        f.order_id = "A1B2C3D4E5F7".into();
        f.purpose = V1Purpose::Restaurant;
        f.item_count = Some(3);
        f.vat_micro_units = Some(12_500_000);
        let out = encode_v1(&f).unwrap();
        assert_eq!(out, "v1: M:KTH00001 O:A1B2C3D4E5F7 P:RESTAURANT I:3 V:12500000");
    }

    #[test]
    fn encode_refund() {
        let mut f = baseline();
        f.order_id = "A1B2C3D4E5F8".into();
        f.purpose = V1Purpose::Refund;
        f.refund_of = Some("550e8400-e29b-41d4-a716-446655440000".into());
        let out = encode_v1(&f).unwrap();
        assert_eq!(out, "v1: M:KTH00001 O:A1B2C3D4E5F8 P:REFUND R:550e8400-e29b-41d4-a716-446655440000");
    }

    #[test]
    fn encode_canonical_optional_order() {
        // ADR-004: optional tokens emitted in I V D R order.
        let mut f = baseline();
        f.merchant_id = "MMMMMMMM".into();
        f.order_id = "OOOOOOOOOOOO".into();
        f.item_count = Some(2);
        f.vat_micro_units = Some(11);
        f.discount_micro_units = Some(7);
        let out = encode_v1(&f).unwrap();
        assert_eq!(out, "v1: M:MMMMMMMM O:OOOOOOOOOOOO P:RETAIL I:2 V:11 D:7");
    }

    #[test]
    fn encode_rejects_short_merchant_id() {
        let mut f = baseline();
        f.merchant_id = "KTH001".into();
        assert!(matches!(encode_v1(&f), Err(EncodeError::Validation { field: "merchantId", .. })));
    }

    #[test]
    fn encode_rejects_refund_without_r() {
        let mut f = baseline();
        f.purpose = V1Purpose::Refund;
        assert!(matches!(encode_v1(&f), Err(EncodeError::Validation { field: "refundOf", .. })));
    }

    #[test]
    fn encode_rejects_r_on_non_refund() {
        let mut f = baseline();
        f.refund_of = Some("550e8400-e29b-41d4-a716-446655440000".into());
        assert!(matches!(encode_v1(&f), Err(EncodeError::Validation { field: "refundOf", .. })));
    }

    #[test]
    fn decode_simple_retail() {
        let r = decode("v1: M:KTH00001 O:A1B2C3D4E5F6 P:RETAIL");
        match r {
            DecodeResult::V1 { fields } => {
                assert_eq!(fields.merchant_id, "KTH00001");
                assert_eq!(fields.order_id, "A1B2C3D4E5F6");
                assert_eq!(fields.purpose, V1Purpose::Retail);
            }
            other => panic!("expected V1, got {other:?}"),
        }
    }

    #[test]
    fn decode_v2_versioned() {
        let r = decode("v2: P:OTHR N:agent-payment G:service");
        match r {
            DecodeResult::V2 { fields } => {
                assert_eq!(fields.purpose, "OTHR");
                assert_eq!(fields.nature, "agent-payment");
                assert_eq!(fields.goal, "service");
            }
            other => panic!("expected V2, got {other:?}"),
        }
    }

    #[test]
    fn decode_v2_unversioned_legacy() {
        let r = decode("P:OTHR N:agent-payment G:service");
        assert!(matches!(r, DecodeResult::UnversionedV2 { .. }));
    }

    #[test]
    fn decode_free_text() {
        let r = decode("Coffee, large, oat milk");
        assert!(matches!(r, DecodeResult::Unknown { .. }));
    }

    #[test]
    fn decode_invalid_order() {
        let r = decode("v1: O:A1B2C3D4E5F6 M:KTH00001 P:RETAIL");
        assert!(matches!(r, DecodeResult::Invalid { .. }));
    }

    #[test]
    fn decode_invalid_purpose() {
        let r = decode("v1: M:KTH00001 O:A1B2C3D4E5F6 P:WHATEVER");
        assert!(matches!(r, DecodeResult::Invalid { .. }));
    }

    #[test]
    fn decode_refund_without_r_is_invalid() {
        let r = decode("v1: M:KTH00001 O:A1B2C3D4E5F6 P:REFUND");
        assert!(matches!(r, DecodeResult::Invalid { .. }));
    }

    #[test]
    fn decode_r_on_non_refund_is_invalid() {
        let r = decode("v1: M:KTH00001 O:A1B2C3D4E5F6 P:RETAIL R:550e8400-e29b-41d4-a716-446655440000");
        assert!(matches!(r, DecodeResult::Invalid { .. }));
    }

    #[test]
    fn decode_v2_hint_with_bad_body_falls_to_unknown() {
        let r = decode("P:OTHR foo bar");
        assert!(matches!(r, DecodeResult::Unknown { .. }));
    }

    // ── Parity: load TS-generated fixtures and assert byte equality ──

    #[test]
    fn parity_encode_v1_matches_ts() {
        let fixture: serde_json::Value = serde_json::from_str(
            include_str!("../../../tests/fixtures/reference.json")
        ).unwrap();
        let cases = fixture["encodeV1"].as_array().unwrap();
        for case in cases {
            let name = case["name"].as_str().unwrap();
            let input: V1Fields = serde_json::from_value(case["input"].clone()).unwrap();
            let expected = case["encoded"].as_str().unwrap();
            let actual = encode_v1(&input).unwrap_or_else(|e| panic!("{name}: encode failed: {e}"));
            assert_eq!(actual, expected, "fixture '{name}'");
        }
    }

    #[test]
    fn parity_decode_kinds_match_ts() {
        let fixture: serde_json::Value = serde_json::from_str(
            include_str!("../../../tests/fixtures/reference.json")
        ).unwrap();
        let cases = fixture["decode"].as_array().unwrap();
        for case in cases {
            let name = case["name"].as_str().unwrap();
            let input = case["input"].as_str().unwrap();
            let expected_kind = case["expectedKind"].as_str().unwrap();
            let r = decode(input);
            let got_kind = match &r {
                DecodeResult::V1 { .. } => "v1",
                DecodeResult::V2 { .. } => "v2",
                DecodeResult::UnversionedV2 { .. } => "unversioned-v2",
                DecodeResult::Unknown { .. } => "unknown",
                DecodeResult::Invalid { .. } => "invalid",
            };
            assert_eq!(got_kind, expected_kind, "fixture '{name}' -> {r:?}");
        }
    }
}
