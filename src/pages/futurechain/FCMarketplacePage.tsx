import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShoppingBag, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';

interface Service {
  id: string;
  module_id: string;
  title: string;
  description: string;
  price_ftc: number;
  pricing_model: string;
  quality_threshold_full: number | null;
  quality_threshold_partial: number | null;
  partial_pay_percent: number | null;
  max_turnaround_hours: number | null;
  is_active: boolean;
  created_at: string;
}

const EMPTY_FORM = { moduleId: '', title: '', description: '', priceFtc: '', qualityThresholdFull: '', qualityThresholdPartial: '', partialPayPercent: '', maxTurnaroundHours: '' };

export default function FCMarketplacePage() {
  const navigate = useNavigate();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/futurechain/marketplace/services?active=false');
      if (res.ok) setServices(await res.json());
    } catch { /* empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.moduleId || !form.title || !form.description || !form.priceFtc) return;
    setCreating(true);
    try {
      const res = await fetchWithAuth('/api/futurechain/marketplace/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleId: form.moduleId,
          title: form.title,
          description: form.description,
          priceFtc: Number(form.priceFtc),
          qualityThresholdFull: form.qualityThresholdFull ? Number(form.qualityThresholdFull) : undefined,
          qualityThresholdPartial: form.qualityThresholdPartial ? Number(form.qualityThresholdPartial) : undefined,
          partialPayPercent: form.partialPayPercent ? Number(form.partialPayPercent) : undefined,
          maxTurnaroundHours: form.maxTurnaroundHours ? Number(form.maxTurnaroundHours) : undefined,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setForm({ ...EMPTY_FORM });
        await load();
      }
    } catch { /* empty */ }
    finally { setCreating(false); }
  };

  const handleToggle = async (id: string, active: boolean) => {
    await fetchWithAuth(`/api/futurechain/marketplace/services/${id}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !active }),
    });
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this listing?')) return;
    await fetchWithAuth(`/api/futurechain/marketplace/services/${id}`, { method: 'DELETE' });
    load();
  };

  const inputCls = 'w-full rounded-lg border border-adv-card bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none';
  const labelCls = 'block text-xs font-medium text-adv-gray mb-1';

  return (
    <div className="min-h-screen p-6 space-y-6">
      <button onClick={() => navigate('/futurechain')} className="flex items-center gap-1 text-sm text-adv-gray hover:text-adv-teal">
        <ArrowLeft className="h-4 w-4" /> Back to FutureChain
      </button>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-3">
          <ShoppingBag className="h-6 w-6 text-adv-teal" /> Marketplace
        </h1>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark">
          <Plus className="h-3.5 w-3.5" /> New Listing
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-adv-card bg-adv-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-adv-off-white">Create Service Listing</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Module ID *</label>
              <input className={inputCls} value={form.moduleId} onChange={e => setForm(p => ({ ...p, moduleId: e.target.value }))} placeholder="e.g. gap-assessment" />
            </div>
            <div>
              <label className={labelCls}>Title *</label>
              <input className={inputCls} value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="GDPR Gap Assessment" />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Description *</label>
              <input className={inputCls} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Full compliance gap assessment against GDPR..." />
            </div>
            <div>
              <label className={labelCls}>Price (FTC) *</label>
              <input type="number" min="0" step="0.01" className={inputCls} value={form.priceFtc} onChange={e => setForm(p => ({ ...p, priceFtc: e.target.value }))} placeholder="25.00" />
            </div>
            <div>
              <label className={labelCls}>Max Turnaround (hours)</label>
              <input type="number" min="0" className={inputCls} value={form.maxTurnaroundHours} onChange={e => setForm(p => ({ ...p, maxTurnaroundHours: e.target.value }))} placeholder="24" />
            </div>
            <div>
              <label className={labelCls}>Quality Threshold Full (%)</label>
              <input type="number" min="0" max="100" className={inputCls} value={form.qualityThresholdFull} onChange={e => setForm(p => ({ ...p, qualityThresholdFull: e.target.value }))} placeholder="90" />
            </div>
            <div>
              <label className={labelCls}>Quality Threshold Partial (%)</label>
              <input type="number" min="0" max="100" className={inputCls} value={form.qualityThresholdPartial} onChange={e => setForm(p => ({ ...p, qualityThresholdPartial: e.target.value }))} placeholder="70" />
            </div>
          </div>
          <button onClick={handleCreate} disabled={creating || !form.moduleId || !form.title || !form.description || !form.priceFtc}
            className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark disabled:opacity-40">
            {creating ? 'Creating...' : 'Create Listing'}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-adv-gray text-center py-12">Loading marketplace...</p>
      ) : services.length === 0 ? (
        <div className="rounded-xl border border-adv-card bg-adv-card p-10 text-center">
          <ShoppingBag className="h-12 w-12 text-adv-gray mx-auto mb-4" />
          <p className="text-adv-gray">No service listings yet. Create your first to offer AI services.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map(svc => (
            <div key={svc.id} className={`rounded-xl border bg-adv-card p-5 ${svc.is_active ? 'border-adv-card' : 'border-adv-gray/20 opacity-60'}`}>
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-adv-off-white text-sm">{svc.title}</h3>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleToggle(svc.id, svc.is_active)} className="text-adv-gray hover:text-adv-teal" title={svc.is_active ? 'Deactivate' : 'Activate'}>
                    {svc.is_active ? <ToggleRight className="h-5 w-5 text-adv-teal" /> : <ToggleLeft className="h-5 w-5" />}
                  </button>
                  <button onClick={() => handleDelete(svc.id)} className="text-adv-gray hover:text-adv-red">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-adv-gray mb-3 line-clamp-2">{svc.description}</p>
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-adv-teal">{Number(svc.price_ftc).toFixed(2)} FTC</span>
                <span className="text-xs text-adv-gray">{svc.module_id}</span>
              </div>
              {svc.quality_threshold_full != null && (
                <div className="text-xs text-adv-gray mt-2">Quality: {svc.quality_threshold_full}% full / {svc.quality_threshold_partial ?? '–'}% partial</div>
              )}
              {svc.max_turnaround_hours != null && (
                <div className="text-xs text-adv-gray mt-1">Turnaround: {svc.max_turnaround_hours}h max</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
