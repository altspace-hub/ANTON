-- ──────────────────────────────────────────────────────────────────────────────
-- 141_esp32_regional_sourcing_more.sql — extended regional alternatives
-- for the seeded ESP32-WROOM-32E HKP (Phase 8 humanitarian readiness).
--
-- Adds finer-grained sourcing options across West Africa + EU with local
-- currency pricing + lead times + counterfeit risk classification. Distributor
-- names are publicly listed agents at time of writing; users should verify
-- current authorisation status before procurement.
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO hkp_regional_alternatives
  (hkp_id, region, alternative_part, distributor,
   typical_price_local, typical_price_currency, typical_lead_days,
   counterfeit_risk, notes) VALUES

-- West Africa — Nigeria
('hkp-esp32-wroom-32e-v1', 'west-africa', 'ESP32-WROOM-32E (genuine)',
 'Skyfi Labs Lagos',
 4500.00, 'NGN', 5,
 'moderate',
 'Lagos-based maker store. Historically genuine but stock turnover varies — request photos of the can + FCC ID etching before bulk order. Pickup available; same-day delivery within Lagos.'),

('hkp-esp32-wroom-32e-v1', 'west-africa', 'ESP32-WROOM-32E (genuine)',
 'Robotique Africa (Abuja)',
 5200.00, 'NGN', 7,
 'moderate',
 'Robotics-focused supplier. Carries genuine Espressif and clearly-labelled clones in separate SKUs.'),

-- West Africa — Ghana
('hkp-esp32-wroom-32e-v1', 'west-africa', 'ESP32-WROOM-32E (genuine)',
 'Robotech Shop Accra',
 110.00, 'GHS', 4,
 'low',
 'Authorised reseller chain (Robotech Group). Stocks consistent FCC-marked WROOM-32E units. Bulk pricing breaks at 10/50/100.'),

-- West Africa — Senegal / Côte d''Ivoire
('hkp-esp32-wroom-32e-v1', 'west-africa', 'ESP32-WROOM-32E (genuine)',
 'Senstartup Tech Supplies (Dakar)',
 6500.00, 'XOF', 10,
 'moderate',
 'Senegal supplier shipping across UEMOA. Mix of genuine + clone stock — confirm FCC ID at receipt.'),

('hkp-esp32-wroom-32e-v1', 'west-africa', 'ESP32-DevKitC-V4 (devkit)',
 'Direct from Espressif via DHL (forwarder to Abidjan / Lagos / Accra)',
 14.50, 'USD', 14,
 'low',
 'Bulk shipment via consolidated forwarding service. Customs broker fee adds ~$2-4/unit. Best counterfeit-risk-vs-cost trade-off for orders above ~25 units to West Africa.'),

-- EU — Germany / Netherlands
('hkp-esp32-wroom-32e-v1', 'eu', 'ESP32-WROOM-32E',
 'TME (Poland, EU-wide shipping)',
 4.95, 'EUR', 2,
 'low',
 'Authorised Espressif distributor. Strong on logistics in Eastern + Central EU; bulk pricing favourable.'),

('hkp-esp32-wroom-32e-v1', 'eu', 'ESP32-WROOM-32E',
 'Conrad Electronic (DE/AT/CH)',
 8.20, 'EUR', 3,
 'low',
 'Authorised distributor; good for low-volume / mixed orders. Carries the ESP32-DevKitC variant pre-packaged for educational use.'),

('hkp-esp32-wroom-32e-v1', 'eu', 'ESP32-WROOM-32E',
 'AZ-Delivery (DE direct)',
 4.50, 'EUR', 3,
 'moderate',
 'Maker-focused EU brand. Re-packages Espressif stock; some users report occasional inconsistent batches — order one sample first for any volume above 50 units.'),

('hkp-esp32-wroom-32e-v1', 'eu', 'ESP32-WROOM-32E (suspect)',
 'eBay third-party EU sellers',
 3.20, 'EUR', 8,
 'high',
 'Mixed provenance. Acceptable for prototyping only; never for Tier 2 / Tier 3 builds.'),

-- Global / online
('hkp-esp32-wroom-32e-v1', 'global', 'ESP32-WROOM-32E',
 'Espressif official store (Aliexpress flagship)',
 3.80, 'USD', 12,
 'low',
 'Espressif''s own AliExpress flagship store — distinct from generic AliExpress sellers. Confirms genuine module.')

ON CONFLICT DO NOTHING;
