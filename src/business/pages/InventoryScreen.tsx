/**
 * InventoryScreen — stock levels for every tracked catalogue item.
 *
 * List view:
 *   • Low-stock items float to the top with an amber flag.
 *   • Each row shows current stock (= Σ movement deltas) and the
 *     low-stock threshold.
 *   • Tap a row → the adjust sheet.
 *
 * Adjust sheet (per item):
 *   • Restock (+) / Wastage (−) / Adjustment (± recount) / set the
 *     low-stock threshold.
 *   • Each action appends one immutable movement; the running history
 *     for the item is shown below so the merchant sees exactly why
 *     stock is where it is.
 *
 * Only items with trackStock=true appear here. Turning tracking on
 * happens in the item editor (ItemsManageScreen).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PrimaryButton from '../components/PrimaryButton';
import {
  inventoryRows, listMovementsForItem, restock, recordWastage,
  adjustStock, type InventoryRow, type StockMovement,
} from '../services/inventory';
import { updateItem, type CatalogueItem } from '../services/items';

interface Props {
  onBack: () => void;
}

export default function InventoryScreen({ onBack }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<InventoryRow | null>(null);

  async function refresh() {
    setRows(await inventoryRows());
    setLoading(false);
  }
  useEffect(() => { void refresh(); }, []);

  const lowCount = useMemo(() => rows.filter((r) => r.isLow).length, [rows]);

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        <div className="flex items-center gap-3 -ml-2 mb-4">
          <button type="button" onClick={onBack} className="p-2 rounded-lg"
                  aria-label={t('common.back', 'Back')}
                  style={{ color: 'var(--color-text-muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
            {t('inventory.title', 'Inventory')}
          </h2>
        </div>

        {lowCount > 0 && (
          <div className="rounded-xl p-3 mb-3 text-xs"
               style={{ backgroundColor: 'var(--color-warning-bg)',
                        border: '1px solid var(--color-warning)',
                        color: 'var(--color-warning)' }}>
            {t('inventory.lowStockBanner', '{{count}} item(s) at or below their low-stock level.',
              { count: lowCount })}
          </div>
        )}

        {loading ? (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {t('common.loading', 'Loading…')}
          </p>
        ) : rows.length === 0 ? (
          <div className="rounded-xl p-6 text-center"
               style={{ backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)' }}>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {t('inventory.empty',
                'No items tracked yet. Turn on stock tracking for an item in Settings → Items.')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((row) => (
              <button key={row.item.id} type="button" onClick={() => setEditing(row)}
                      className="rounded-xl p-3 flex items-center gap-3 text-left"
                      style={{ backgroundColor: 'var(--color-surface)',
                               border: `1px solid ${row.isLow ? 'var(--color-warning)' : 'var(--color-border)'}` }}>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>
                    {row.item.name}
                  </div>
                  {row.item.category && (
                    <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-faint)' }}>
                      {row.item.category}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-bold text-lg tabular"
                       style={{ color: row.isLow ? 'var(--color-warning)' : 'var(--color-text)' }}>
                    {row.stock}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--color-text-faint)' }}>
                    {row.isLow
                      ? t('inventory.lowFlag', 'Low · min {{n}}', { n: row.lowStockThreshold })
                      : t('inventory.inStock', 'in stock')}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <AdjustSheet
          row={editing}
          onClose={() => setEditing(null)}
          onChanged={async () => { await refresh(); }}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// AdjustSheet — restock / wastage / adjustment + threshold + history
// ───────────────────────────────────────────────────────────────────────

type Action = 'restock' | 'wastage' | 'adjustment';

function AdjustSheet({
  row, onClose, onChanged,
}: {
  row: InventoryRow;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [action, setAction] = useState<Action>('restock');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [threshold, setThreshold] = useState(String(row.lowStockThreshold));
  const [history, setHistory] = useState<StockMovement[]>([]);
  const [stock, setStock] = useState(row.stock);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadHistory() {
    const h = await listMovementsForItem(row.item.id);
    setHistory(h);
    setStock(h.reduce((n, m) => n + m.delta, 0));
  }
  useEffect(() => { void loadHistory(); }, [row.item.id]);

  const numericQty = Number.parseInt(qty, 10);
  // For restock/wastage qty must be > 0; for adjustment it's a signed
  // delta and may be negative but not zero.
  const qtyValid = action === 'adjustment'
    ? Number.isInteger(numericQty) && numericQty !== 0
    : Number.isInteger(numericQty) && numericQty > 0;

  async function apply() {
    if (!qtyValid) return;
    setBusy(true);
    setError(null);
    try {
      if (action === 'restock') {
        await restock(row.item, numericQty, note.trim() || undefined);
      } else if (action === 'wastage') {
        await recordWastage(row.item, numericQty, note.trim() || undefined);
      } else {
        await adjustStock(row.item, numericQty, note.trim() || undefined);
      }
      setQty('');
      setNote('');
      await loadHistory();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveThreshold() {
    const n = Number.parseInt(threshold, 10);
    if (!Number.isInteger(n) || n < 0) return;
    setBusy(true);
    try {
      await updateItem(row.item.id, { lowStockThreshold: n } as Partial<CatalogueItem>);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const actions: Array<{ id: Action; label: string }> = [
    { id: 'restock',    label: t('inventory.restock', 'Restock') },
    { id: 'wastage',    label: t('inventory.wastage', 'Wastage') },
    { id: 'adjustment', label: t('inventory.adjustment', 'Adjust') },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end"
         style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full rounded-t-2xl pt-4 pb-6 px-5"
           style={{ backgroundColor: 'var(--color-bg)',
                    maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="flex justify-center mb-3">
          <div style={{ width: 36, height: 4, borderRadius: 2,
                        backgroundColor: 'var(--color-border)' }} />
        </div>

        <div className="flex items-baseline justify-between mb-1">
          <h3 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
            {row.item.name}
          </h3>
          <span className="text-2xl font-bold tabular" style={{ color: 'var(--color-text)' }}>
            {stock}
          </span>
        </div>
        <div className="text-xs mb-4" style={{ color: 'var(--color-text-faint)' }}>
          {t('inventory.currentStock', 'Current stock')}
        </div>

        {/* Action selector */}
        <div className="flex gap-2 mb-3">
          {actions.map((a) => (
            <button key={a.id} type="button" onClick={() => setAction(a.id)}
                    className="flex-1 py-2 rounded-lg text-sm font-semibold"
                    style={{
                      backgroundColor: action === a.id ? 'var(--color-accent)' : 'var(--color-surface)',
                      color: action === a.id ? 'var(--color-accent-fg)' : 'var(--color-text)',
                      border: '1px solid var(--color-border)',
                    }}>
              {a.label}
            </button>
          ))}
        </div>

        <input value={qty} onChange={(e) => setQty(e.target.value)}
               type="number" inputMode="numeric"
               placeholder={action === 'adjustment'
                 ? t('inventory.qtyDeltaPlaceholder', 'Change (e.g. -2 or 5)')
                 : t('inventory.qtyPlaceholder', 'Quantity')}
               className="w-full mb-2" />
        <input value={note} onChange={(e) => setNote(e.target.value)}
               placeholder={t('inventory.notePlaceholder', 'Note (optional)')}
               className="w-full mb-3" />

        {error && (
          <p className="text-xs mb-2" style={{ color: 'var(--color-error)' }}>{error}</p>
        )}

        <div className="flex gap-2 mb-4">
          <button type="button" onClick={onClose}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold"
                  style={{ backgroundColor: 'var(--color-surface)',
                           border: '1px solid var(--color-border)',
                           color: 'var(--color-text)' }}>
            {t('common.close', 'Close')}
          </button>
          <button type="button" onClick={apply} disabled={!qtyValid || busy}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold"
                  style={{ backgroundColor: 'var(--color-accent)',
                           color: 'var(--color-accent-fg)',
                           opacity: (!qtyValid || busy) ? 0.5 : 1 }}>
            {t('inventory.apply', 'Apply')}
          </button>
        </div>

        {/* Low-stock threshold */}
        <div className="rounded-xl p-3 mb-4"
             style={{ backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)' }}>
          <div className="text-xs font-semibold uppercase tracking-wider mb-2"
               style={{ color: 'var(--color-text-faint)' }}>
            {t('inventory.lowStockLevel', 'Low-stock alert level')}
          </div>
          <div className="flex gap-2">
            <input value={threshold} onChange={(e) => setThreshold(e.target.value)}
                   type="number" inputMode="numeric"
                   className="flex-1" />
            <button type="button" onClick={saveThreshold} disabled={busy}
                    className="px-4 rounded-lg text-sm font-semibold"
                    style={{ backgroundColor: 'var(--color-surface-muted)',
                             color: 'var(--color-text)',
                             border: '1px solid var(--color-border)' }}>
              {t('common.save', 'Save')}
            </button>
          </div>
        </div>

        {/* Movement history */}
        <div className="text-xs font-semibold uppercase tracking-wider mb-2"
             style={{ color: 'var(--color-text-faint)' }}>
          {t('inventory.history', 'Movement history')}
        </div>
        {history.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--color-text-faint)' }}>—</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {history.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-xs">
                <div className="min-w-0">
                  <span style={{ color: 'var(--color-text)' }}>
                    {kindLabel(m.kind, t)}
                  </span>
                  {m.note && (
                    <span className="ml-1" style={{ color: 'var(--color-text-faint)' }}>
                      · {m.note}
                    </span>
                  )}
                  {m.kvittoNumber !== undefined && (
                    <span className="ml-1" style={{ color: 'var(--color-text-faint)' }}>
                      · K-{m.kvittoNumber}
                    </span>
                  )}
                  <div style={{ color: 'var(--color-text-faint)' }}>
                    {new Date(m.createdAt).toLocaleString('sv-SE', {
                      year: 'numeric', month: '2-digit', day: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                </div>
                <span className="font-bold tabular ml-2"
                      style={{ color: m.delta >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                  {m.delta >= 0 ? '+' : ''}{m.delta}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function kindLabel(kind: StockMovement['kind'], t: (k: string, d: string) => string): string {
  switch (kind) {
    case 'initial':    return t('inventory.kindInitial', 'Initial count');
    case 'sale':       return t('inventory.kindSale', 'Sale');
    case 'restock':    return t('inventory.kindRestock', 'Restock');
    case 'adjustment': return t('inventory.kindAdjustment', 'Adjustment');
    case 'wastage':    return t('inventory.kindWastage', 'Wastage');
  }
}
