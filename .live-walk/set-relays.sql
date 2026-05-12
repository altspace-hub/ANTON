UPDATE instance_identity SET relay_endpoints = '["wss://relay.futurechain.eu","wss://test.example.com"]'::jsonb;
SELECT relay_endpoints FROM instance_identity;
