-- Migration 084: Enhanced KYC fields — PSP best-practice CDD, PEP, financial info

ALTER TABLE fc_kyc_profiles ADD COLUMN IF NOT EXISTS annual_income_range TEXT;
ALTER TABLE fc_kyc_profiles ADD COLUMN IF NOT EXISTS estimated_savings TEXT;
ALTER TABLE fc_kyc_profiles ADD COLUMN IF NOT EXISTS employment_status TEXT;
ALTER TABLE fc_kyc_profiles ADD COLUMN IF NOT EXISTS employer_name TEXT;
ALTER TABLE fc_kyc_profiles ADD COLUMN IF NOT EXISTS industry_sector TEXT;
ALTER TABLE fc_kyc_profiles ADD COLUMN IF NOT EXISTS source_of_funds TEXT;
ALTER TABLE fc_kyc_profiles ADD COLUMN IF NOT EXISTS source_of_funds_description TEXT;
ALTER TABLE fc_kyc_profiles ADD COLUMN IF NOT EXISTS is_pep BOOLEAN DEFAULT FALSE;
ALTER TABLE fc_kyc_profiles ADD COLUMN IF NOT EXISTS is_pep_associate BOOLEAN DEFAULT FALSE;
ALTER TABLE fc_kyc_profiles ADD COLUMN IF NOT EXISTS pep_description TEXT;
ALTER TABLE fc_kyc_profiles ADD COLUMN IF NOT EXISTS purpose JSONB DEFAULT '[]';
ALTER TABLE fc_kyc_profiles ADD COLUMN IF NOT EXISTS purpose_other TEXT;
ALTER TABLE fc_kyc_profiles ADD COLUMN IF NOT EXISTS expected_tx_volume TEXT;
ALTER TABLE fc_kyc_profiles ADD COLUMN IF NOT EXISTS expected_monthly_value TEXT;
