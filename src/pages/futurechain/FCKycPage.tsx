import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Save, Info, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';

const COUNTRIES = [
  { code: 'SE', name: 'Sweden' }, { code: 'NO', name: 'Norway' }, { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' }, { code: 'DE', name: 'Germany' }, { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' }, { code: 'FR', name: 'France' }, { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' }, { code: 'NL', name: 'Netherlands' }, { code: 'BE', name: 'Belgium' },
  { code: 'CH', name: 'Switzerland' }, { code: 'AT', name: 'Austria' }, { code: 'IE', name: 'Ireland' },
  { code: 'PT', name: 'Portugal' }, { code: 'PL', name: 'Poland' }, { code: 'CZ', name: 'Czech Republic' },
  { code: 'JP', name: 'Japan' }, { code: 'AU', name: 'Australia' }, { code: 'CA', name: 'Canada' },
  { code: 'SG', name: 'Singapore' }, { code: 'HK', name: 'Hong Kong' }, { code: 'KR', name: 'South Korea' },
].sort((a, b) => a.name.localeCompare(b.name));

const ID_TYPES = ['passport', 'national_id', 'drivers_license'] as const;
const SOURCE_OF_FUNDS = ['employment', 'business', 'investments', 'inheritance', 'savings', 'other'] as const;

const ANNUAL_INCOME_RANGES = [
  'Under \u20ac25,000',
  '\u20ac25,000 \u2013 \u20ac50,000',
  '\u20ac50,000 \u2013 \u20ac100,000',
  '\u20ac100,000 \u2013 \u20ac250,000',
  '\u20ac250,000 \u2013 \u20ac500,000',
  'Over \u20ac500,000',
] as const;

const ESTIMATED_SAVINGS_RANGES = [
  'Under \u20ac10,000',
  '\u20ac10,000 \u2013 \u20ac50,000',
  '\u20ac50,000 \u2013 \u20ac100,000',
  '\u20ac100,000 \u2013 \u20ac500,000',
  'Over \u20ac500,000',
] as const;

const EMPLOYMENT_STATUSES = ['Employed', 'Self-employed', 'Retired', 'Student', 'Unemployed', 'Other'] as const;

const INDUSTRY_SECTORS = [
  'Technology', 'Finance', 'Healthcare', 'Government', 'Education',
  'Legal', 'Manufacturing', 'Retail', 'Other',
] as const;

const PURPOSE_OPTIONS = [
  { value: 'ai_services', label: 'Paying for AI services (ANTON delegation)' },
  { value: 'receiving_expertise', label: 'Receiving payment for expertise' },
  { value: 'personal_transfers', label: 'Personal transfers' },
  { value: 'business_payments', label: 'Business payments' },
  { value: 'investment', label: 'Investment' },
  { value: 'other', label: 'Other' },
] as const;

const EXPECTED_TX_VOLUMES = ['1\u20135 per month', '5\u201320 per month', '20\u201350 per month', '50+ per month'] as const;

const EXPECTED_MONTHLY_VALUES = [
  'Under \u20ac100',
  '\u20ac100 \u2013 \u20ac500',
  '\u20ac500 \u2013 \u20ac2,000',
  '\u20ac2,000 \u2013 \u20ac10,000',
  'Over \u20ac10,000',
] as const;

interface KycForm {
  full_legal_name_enc: string;
  country: string;
  street_address_enc: string;
  city_enc: string;
  postal_code_enc: string;
  address_country: string;
  id_document_number_enc: string;
  id_document_type: string;
  id_issuing_country: string;
  date_of_birth_enc: string;
  nationality: string;
  tax_id_number_enc: string;
  source_of_funds: string;
  source_of_funds_description: string;
  annual_income_range: string;
  estimated_savings: string;
  employment_status: string;
  employer_name: string;
  industry_sector: string;
  is_pep: boolean;
  is_pep_associate: boolean;
  pep_description: string;
  purpose: string[];
  purpose_other: string;
  expected_tx_volume: string;
  expected_monthly_value: string;
}

const EMPTY: KycForm = {
  full_legal_name_enc: '', country: '', street_address_enc: '', city_enc: '',
  postal_code_enc: '', address_country: '', id_document_number_enc: '',
  id_document_type: '', id_issuing_country: '', date_of_birth_enc: '',
  nationality: '', tax_id_number_enc: '', source_of_funds: '',
  source_of_funds_description: '',
  annual_income_range: '', estimated_savings: '', employment_status: '',
  employer_name: '', industry_sector: '',
  is_pep: false, is_pep_associate: false, pep_description: '',
  purpose: [], purpose_other: '',
  expected_tx_volume: '', expected_monthly_value: '',
};

export default function FCKycPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<KycForm>({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [amlExpanded, setAmlExpanded] = useState(false);
  const [pepTooltip, setPepTooltip] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/futurechain/kyc');
      if (res.ok) {
        const data = await res.json();
        // Parse purpose from JSONB if it comes back as a string
        let purposeArr: string[] = [];
        if (data.purpose) {
          if (typeof data.purpose === 'string') {
            try { purposeArr = JSON.parse(data.purpose); } catch { purposeArr = []; }
          } else if (Array.isArray(data.purpose)) {
            purposeArr = data.purpose;
          }
        }
        setForm(prev => ({
          ...prev,
          ...data,
          is_pep: !!data.is_pep,
          is_pep_associate: !!data.is_pep_associate,
          purpose: purposeArr,
          purpose_other: data.purpose_other ?? '',
          source_of_funds_description: data.source_of_funds_description ?? '',
          pep_description: data.pep_description ?? '',
          employer_name: data.employer_name ?? '',
        }));
      }
    } catch { /* empty */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetchWithAuth('/api/futurechain/kyc', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          purpose: JSON.stringify(form.purpose),
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { /* empty */ }
    finally { setSaving(false); }
  };

  const set = (key: keyof KycForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  const togglePurpose = (value: string) => {
    setForm(prev => {
      const current = prev.purpose;
      const next = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value];
      return { ...prev, purpose: next };
    });
  };

  const inputCls = 'w-full rounded-lg border border-adv-card bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none';
  const labelCls = 'block text-xs font-medium text-adv-gray mb-1';
  const sectionCls = 'text-sm font-semibold text-adv-off-white pt-4 pb-1 border-b border-adv-card/60 mb-3';

  return (
    <div className="min-h-screen p-6 space-y-6 max-w-3xl mx-auto">
      <button onClick={() => navigate('/futurechain')} className="flex items-center gap-1 text-sm text-adv-gray hover:text-adv-teal">
        <ArrowLeft className="h-4 w-4" /> Back to FutureChain
      </button>

      <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-3">
        <Shield className="h-6 w-6 text-adv-teal" /> KYC Profile
      </h1>
      <p className="text-sm text-adv-gray">ISO 20022 identity fields for transaction compliance. PSP-grade customer due diligence.</p>

      {/* Encryption Banner */}
      <div className="rounded-lg border border-adv-teal/30 bg-adv-teal/5 px-4 py-3 text-sm text-adv-teal flex items-center gap-2">
        <Shield className="h-4 w-4 shrink-0" /> This data stays on your device and is encrypted at rest. No personal data is transmitted to FutureChain AB or any third party.
      </div>

      {/* ISO 20022 Info Card */}
      <div className="rounded-lg border border-adv-blue/30 bg-adv-blue/5 px-4 py-4 space-y-3">
        <div className="flex items-start gap-2">
          <Info className="h-5 w-5 text-adv-blue shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-adv-blue mb-2">ISO 20022 & Your Data</h3>
            <p className="text-xs text-adv-off-white/80 leading-relaxed">
              FutureChain uses the ISO 20022 PACS.008 message standard -- the same standard
              used by SWIFT and all major payment networks worldwide. When you make a transaction,
              the following fields from your KYC profile are included in the payment message:
            </p>
            <ul className="mt-2 space-y-1 text-xs text-adv-off-white/80">
              <li className="flex items-center gap-2"><span className="text-adv-blue">&#x2022;</span> Full legal name (as debtor/creditor name)</li>
              <li className="flex items-center gap-2"><span className="text-adv-blue">&#x2022;</span> Country of residence</li>
              <li className="flex items-center gap-2"><span className="text-adv-blue">&#x2022;</span> Postal address (street, city, postal code)</li>
            </ul>
            <p className="mt-3 text-xs text-adv-off-white/80 leading-relaxed">
              This information travels WITH the transaction on the blockchain and is visible to
              the receiving party and any compliance systems in the payment chain.
            </p>
            <div className="mt-3 rounded border border-adv-blue/20 bg-adv-blue/5 px-3 py-2">
              <p className="text-xs text-adv-off-white/70 leading-relaxed">
                Other KYC information (income, PEP status, source of funds) is stored <strong className="text-adv-off-white">locally only</strong> and
                is <strong className="text-adv-off-white">NEVER</strong> included in transactions. This data is collected to:
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-adv-off-white/70">
                <li>&#x2022; Meet Anti-Money Laundering (AML) requirements</li>
                <li>&#x2022; Enable future compliance reporting</li>
                <li>&#x2022; Support enhanced due diligence when required</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Main Form */}
      <div className="rounded-xl border border-adv-card bg-adv-card p-5 space-y-1">

        {/* ── Identity ── */}
        <h3 className={sectionCls}>Personal Identity</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Full Legal Name *</label>
            <input className={inputCls} value={form.full_legal_name_enc} onChange={set('full_legal_name_enc')} placeholder="John A. Smith" required />
          </div>
          <div>
            <label className={labelCls}>Country of Residence *</label>
            <select className={inputCls} value={form.country} onChange={set('country')} required>
              <option value="">Select country...</option>
              {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {/* ── Address ── */}
        <h3 className={sectionCls}>Address</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className={labelCls}>Street Address</label>
            <input className={inputCls} value={form.street_address_enc} onChange={set('street_address_enc')} placeholder="123 Main Street" />
          </div>
          <div>
            <label className={labelCls}>City</label>
            <input className={inputCls} value={form.city_enc} onChange={set('city_enc')} placeholder="Stockholm" />
          </div>
          <div>
            <label className={labelCls}>Postal Code</label>
            <input className={inputCls} value={form.postal_code_enc} onChange={set('postal_code_enc')} placeholder="11120" />
          </div>
          <div>
            <label className={labelCls}>Address Country</label>
            <select className={inputCls} value={form.address_country} onChange={set('address_country')}>
              <option value="">Select...</option>
              {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {/* ── Identity Documents ── */}
        <h3 className={sectionCls}>Identity Documents</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Document Number</label>
            <input className={inputCls} value={form.id_document_number_enc} onChange={set('id_document_number_enc')} placeholder="AB1234567" />
          </div>
          <div>
            <label className={labelCls}>Document Type</label>
            <select className={inputCls} value={form.id_document_type} onChange={set('id_document_type')}>
              <option value="">Select...</option>
              {ID_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Issuing Country</label>
            <select className={inputCls} value={form.id_issuing_country} onChange={set('id_issuing_country')}>
              <option value="">Select...</option>
              {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {/* ── Personal Details ── */}
        <h3 className={sectionCls}>Personal Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Date of Birth</label>
            <input type="date" className={inputCls} value={form.date_of_birth_enc} onChange={set('date_of_birth_enc')} />
          </div>
          <div>
            <label className={labelCls}>Nationality</label>
            <select className={inputCls} value={form.nationality} onChange={set('nationality')}>
              <option value="">Select...</option>
              {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Tax ID Number</label>
            <input className={inputCls} value={form.tax_id_number_enc} onChange={set('tax_id_number_enc')} placeholder="YYYYMMDD-XXXX" />
          </div>
        </div>

        {/* ── Financial Information ── */}
        <h3 className={sectionCls}>Financial Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Annual Income Range</label>
            <select className={inputCls} value={form.annual_income_range} onChange={set('annual_income_range')}>
              <option value="">Select...</option>
              {ANNUAL_INCOME_RANGES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Estimated Savings</label>
            <select className={inputCls} value={form.estimated_savings} onChange={set('estimated_savings')}>
              <option value="">Select...</option>
              {ESTIMATED_SAVINGS_RANGES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Employment Status</label>
            <select className={inputCls} value={form.employment_status} onChange={set('employment_status')}>
              <option value="">Select...</option>
              {EMPLOYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Employer / Business Name <span className="text-adv-gray/60">(optional)</span></label>
            <input className={inputCls} value={form.employer_name} onChange={set('employer_name')} placeholder="FutureChain AB" />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Industry / Sector</label>
            <select className={inputCls} value={form.industry_sector} onChange={set('industry_sector')}>
              <option value="">Select...</option>
              {INDUSTRY_SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* ── Source of Funds ── */}
        <h3 className={sectionCls}>Source of Funds</h3>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Primary Source of Funds</label>
            <select className={inputCls} value={form.source_of_funds} onChange={set('source_of_funds')}>
              <option value="">Select...</option>
              {SOURCE_OF_FUNDS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Please describe the origin of funds you will use</label>
            <textarea
              className={inputCls + ' min-h-[60px] resize-y'}
              value={form.source_of_funds_description}
              onChange={set('source_of_funds_description')}
              placeholder='e.g., "Salary from FutureChain AB" or "Savings accumulated over 10 years"'
              rows={2}
            />
            <p className="text-[10px] text-adv-gray/60 mt-1">A brief description helps meet CDD requirements under AMLR Article 16.</p>
          </div>
        </div>

        {/* ── PEP Status ── */}
        <h3 className={sectionCls}>
          <span className="flex items-center gap-2">
            Politically Exposed Person (PEP)
            <button
              type="button"
              onClick={() => setPepTooltip(!pepTooltip)}
              className="text-adv-blue hover:text-adv-blue/80"
              aria-label="What is a PEP?"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </span>
        </h3>
        {pepTooltip && (
          <div className="rounded-lg border border-adv-blue/20 bg-adv-blue/5 px-3 py-2 mb-3">
            <p className="text-xs text-adv-off-white/70 leading-relaxed">
              A <strong className="text-adv-off-white">Politically Exposed Person (PEP)</strong> holds or has held a prominent public function, such as
              a head of state, senior politician, judicial or military official, or senior executive of a state-owned enterprise.
              Family members and close associates of PEPs are also subject to enhanced due diligence requirements under AMLR Articles 22-25 and FATF Recommendation 12.
            </p>
          </div>
        )}
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Are you a Politically Exposed Person?</label>
            <div className="flex items-center gap-6 mt-1">
              <label className="flex items-center gap-2 text-sm text-adv-off-white cursor-pointer">
                <input
                  type="radio"
                  name="is_pep"
                  checked={form.is_pep === true}
                  onChange={() => setForm(prev => ({ ...prev, is_pep: true }))}
                  className="accent-adv-teal"
                />
                Yes
              </label>
              <label className="flex items-center gap-2 text-sm text-adv-off-white cursor-pointer">
                <input
                  type="radio"
                  name="is_pep"
                  checked={form.is_pep === false}
                  onChange={() => setForm(prev => ({ ...prev, is_pep: false }))}
                  className="accent-adv-teal"
                />
                No
              </label>
            </div>
          </div>
          <div>
            <label className={labelCls}>Are you a family member or close associate of a PEP?</label>
            <div className="flex items-center gap-6 mt-1">
              <label className="flex items-center gap-2 text-sm text-adv-off-white cursor-pointer">
                <input
                  type="radio"
                  name="is_pep_associate"
                  checked={form.is_pep_associate === true}
                  onChange={() => setForm(prev => ({ ...prev, is_pep_associate: true }))}
                  className="accent-adv-teal"
                />
                Yes
              </label>
              <label className="flex items-center gap-2 text-sm text-adv-off-white cursor-pointer">
                <input
                  type="radio"
                  name="is_pep_associate"
                  checked={form.is_pep_associate === false}
                  onChange={() => setForm(prev => ({ ...prev, is_pep_associate: false }))}
                  className="accent-adv-teal"
                />
                No
              </label>
            </div>
          </div>
          {(form.is_pep || form.is_pep_associate) && (
            <div>
              <label className={labelCls}>Please describe your PEP status or relationship</label>
              <textarea
                className={inputCls + ' min-h-[60px] resize-y'}
                value={form.pep_description}
                onChange={set('pep_description')}
                placeholder="Please describe your role or your relationship to the PEP..."
                rows={2}
              />
            </div>
          )}
        </div>

        {/* ── Purpose & Nature ── */}
        <h3 className={sectionCls}>Purpose & Expected Activity</h3>
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Primary purpose of using FutureChain <span className="text-adv-gray/60">(select all that apply)</span></label>
            <div className="space-y-2 mt-1">
              {PURPOSE_OPTIONS.map(opt => (
                <label key={opt.value} className="flex items-center gap-2 text-sm text-adv-off-white cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.purpose.includes(opt.value)}
                    onChange={() => togglePurpose(opt.value)}
                    className="accent-adv-teal rounded"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            {form.purpose.includes('other') && (
              <div className="mt-2">
                <input
                  className={inputCls}
                  value={form.purpose_other}
                  onChange={set('purpose_other')}
                  placeholder="Please specify..."
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Expected Transaction Volume</label>
              <select className={inputCls} value={form.expected_tx_volume} onChange={set('expected_tx_volume')}>
                <option value="">Select...</option>
                {EXPECTED_TX_VOLUMES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Expected Monthly Transaction Value</label>
              <select className={inputCls} value={form.expected_monthly_value} onChange={set('expected_monthly_value')}>
                <option value="">Select...</option>
                {EXPECTED_MONTHLY_VALUES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* AML/CTF Context Note (expandable) */}
      <div className="rounded-xl border border-adv-card bg-adv-card overflow-hidden">
        <button
          type="button"
          onClick={() => setAmlExpanded(!amlExpanded)}
          className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-adv-dark-2/50 transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-adv-off-white">
            <AlertTriangle className="h-4 w-4 text-adv-gold" />
            Why We Ask These Questions -- AML/CTF Legal Basis
          </span>
          {amlExpanded
            ? <ChevronUp className="h-4 w-4 text-adv-gray" />
            : <ChevronDown className="h-4 w-4 text-adv-gray" />
          }
        </button>
        {amlExpanded && (
          <div className="px-5 pb-4 space-y-3 border-t border-adv-card/60">
            <p className="text-xs text-adv-off-white/80 leading-relaxed pt-3">
              Under the EU Anti-Money Laundering Regulation (AMLR) and global AML/CTF frameworks,
              payment service providers must collect and verify customer identity information.
              This is known as <strong className="text-adv-off-white">Customer Due Diligence (CDD)</strong>.
            </p>
            <div className="rounded border border-adv-card/80 bg-adv-dark-2 px-3 py-2.5">
              <p className="text-xs font-medium text-adv-off-white mb-1.5">Key requirements:</p>
              <ul className="space-y-1 text-xs text-adv-off-white/70">
                <li className="flex items-start gap-2">
                  <span className="text-adv-gold mt-0.5">&#x2022;</span>
                  <span><strong className="text-adv-off-white/90">AMLR Articles 16-21:</strong> Customer identification and verification</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-adv-gold mt-0.5">&#x2022;</span>
                  <span><strong className="text-adv-off-white/90">AMLR Articles 22-25:</strong> Enhanced due diligence for higher-risk situations</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-adv-gold mt-0.5">&#x2022;</span>
                  <span><strong className="text-adv-off-white/90">FATF Recommendation 10:</strong> Customer due diligence</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-adv-gold mt-0.5">&#x2022;</span>
                  <span><strong className="text-adv-off-white/90">5AMLD/6AMLD:</strong> EU Anti-Money Laundering Directives</span>
                </li>
              </ul>
            </div>
            <p className="text-xs text-adv-off-white/80 leading-relaxed">
              FutureChain stores all CDD data locally on your device, encrypted at rest.
              No personal data is transmitted to FutureChain AB or any third party unless
              required by law or regulatory request.
            </p>
            <a
              href="https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1624"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs text-adv-blue hover:text-adv-blue/80 underline"
            >
              Learn more: EU AMLR Regulation 2024/1624
            </a>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !form.full_legal_name_enc || !form.country}
          className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark disabled:opacity-40 hover:bg-adv-teal-dark transition-colors"
        >
          <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save KYC Profile'}
        </button>
        {saved && <span className="text-sm text-adv-green">Profile saved successfully</span>}
      </div>
    </div>
  );
}
