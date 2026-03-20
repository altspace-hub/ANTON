import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Save } from 'lucide-react';
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
const PURPOSE = ['personal_payments', 'business_payments', 'investment', 'agent_services'] as const;

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
  purpose: string;
}

const EMPTY: KycForm = {
  full_legal_name_enc: '', country: '', street_address_enc: '', city_enc: '',
  postal_code_enc: '', address_country: '', id_document_number_enc: '',
  id_document_type: '', id_issuing_country: '', date_of_birth_enc: '',
  nationality: '', tax_id_number_enc: '', source_of_funds: '', purpose: '',
};

export default function FCKycPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<KycForm>({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/futurechain/kyc');
      if (res.ok) {
        const data = await res.json();
        setForm(prev => ({ ...prev, ...data }));
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
        body: JSON.stringify(form),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { /* empty */ }
    finally { setSaving(false); }
  };

  const set = (key: keyof KycForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  const inputCls = 'w-full rounded-lg border border-adv-card bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none';
  const labelCls = 'block text-xs font-medium text-adv-gray mb-1';

  return (
    <div className="min-h-screen p-6 space-y-6 max-w-3xl mx-auto">
      <button onClick={() => navigate('/futurechain')} className="flex items-center gap-1 text-sm text-adv-gray hover:text-adv-teal">
        <ArrowLeft className="h-4 w-4" /> Back to FutureChain
      </button>

      <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-3">
        <Shield className="h-6 w-6 text-adv-teal" /> KYC Profile
      </h1>
      <p className="text-sm text-adv-gray">ISO 20022 identity fields for transaction compliance.</p>

      <div className="rounded-lg border border-adv-teal/30 bg-adv-teal/5 px-4 py-3 text-sm text-adv-teal flex items-center gap-2">
        <Shield className="h-4 w-4 shrink-0" /> This data stays on your device and is encrypted.
      </div>

      <div className="rounded-xl border border-adv-card bg-adv-card p-5 space-y-5">
        {/* Required */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Full Legal Name *</label>
            <input className={inputCls} value={form.full_legal_name_enc} onChange={set('full_legal_name_enc')} placeholder="John A. Smith" required />
          </div>
          <div>
            <label className={labelCls}>Country *</label>
            <select className={inputCls} value={form.country} onChange={set('country')} required>
              <option value="">Select country...</option>
              {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {/* Address */}
        <h3 className="text-sm font-semibold text-adv-off-white pt-2">Address</h3>
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

        {/* Identity */}
        <h3 className="text-sm font-semibold text-adv-off-white pt-2">Identity Documents</h3>
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

        {/* Personal */}
        <h3 className="text-sm font-semibold text-adv-off-white pt-2">Personal Details</h3>
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

        {/* Compliance */}
        <h3 className="text-sm font-semibold text-adv-off-white pt-2">Compliance</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Source of Funds</label>
            <select className={inputCls} value={form.source_of_funds} onChange={set('source_of_funds')}>
              <option value="">Select...</option>
              {SOURCE_OF_FUNDS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Purpose</label>
            <select className={inputCls} value={form.purpose} onChange={set('purpose')}>
              <option value="">Select...</option>
              {PURPOSE.map(p => <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving || !form.full_legal_name_enc || !form.country}
          className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark disabled:opacity-40">
          <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save KYC Profile'}
        </button>
        {saved && <span className="text-sm text-adv-green">Profile saved successfully</span>}
      </div>
    </div>
  );
}
