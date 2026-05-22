/**
 * ItemsManageScreen — post-onboarding catalogue editor.
 *
 * The merchant lands here from Settings → Items. They can:
 *   • Edit any existing item (name, price, VAT rate, segment)
 *   • Add a new item from scratch
 *   • Delete an item
 *   • Filter the list by segment chip
 *   • Open the Templates picker to bulk-load an industry catalogue
 *     (append-or-replace prompt confirms intent)
 *
 * Items are stored in `services/items.ts`. Same shape as the onboarding
 * screen — but persists *immediately* per row, no batch save.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Field from '../../components/Field';
import PrimaryButton from '../../components/PrimaryButton';
import {
  addItem, deleteItem, listCategories, loadItems, updateItem,
  type CatalogueItem,
} from '../../services/items';

interface Props {
  onBack: () => void;
  /** Drill-down to the industry-template picker. */
  onOpenTemplates: () => void;
}

const VAT_RATES: Array<0 | 6 | 12 | 25> = [0, 6, 12, 25];

export default function ItemsManageScreen({ onBack, onOpenTemplates }: Props) {
  const { t } = useTranslation();
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null); // null = all
  const [editing, setEditing] = useState<CatalogueItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  async function refresh() {
    const [arr, cats] = await Promise.all([loadItems(), listCategories()]);
    setItems(arr);
    setCategories(cats);
  }
  useEffect(() => { void refresh(); }, []);

  const visible = useMemo(() => {
    if (!activeCat) return items;
    return items.filter((i) => (i.category ?? '') === activeCat);
  }, [items, activeCat]);

  async function handleDelete(id: string) {
    if (!confirm(t('itemsManage.confirmDelete', 'Delete this item?'))) return;
    await deleteItem(id);
    void refresh();
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        <div className="flex items-center gap-3 -ml-2 mb-5">
          <button type="button" onClick={onBack} className="p-2 rounded-lg"
                  aria-label={t('common.back', 'Back')}
                  style={{ color: 'var(--color-text-muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
            {t('itemsManage.title', 'Items')}
          </h2>
        </div>

        {/* Templates entry */}
        <button type="button" onClick={onOpenTemplates}
                className="rounded-xl p-4 mb-3 text-left flex items-center gap-3"
                style={{ backgroundColor: 'var(--color-surface)',
                         border: '1px solid var(--color-border)' }}>
          <span style={{ fontSize: 28 }}>📋</span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>
              {t('itemsManage.openTemplates', 'Browse industry templates')}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {t('itemsManage.openTemplatesSub', '40 ready-made catalogues — café, salon, plumber, more')}
            </div>
          </div>
          <span style={{ color: 'var(--color-text-faint)' }}>›</span>
        </button>

        {/* Category chips */}
        {categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto mb-3 -mx-1 px-1 pb-1">
            <button type="button" onClick={() => setActiveCat(null)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap"
                    style={{
                      backgroundColor: activeCat === null ? 'var(--color-accent)' : 'var(--color-surface)',
                      color: activeCat === null ? 'var(--color-accent-fg)' : 'var(--color-text)',
                      border: '1px solid var(--color-border)',
                    }}>
              {t('itemsManage.allCategories', 'All')}
            </button>
            {categories.map((cat) => (
              <button key={cat} type="button" onClick={() => setActiveCat(cat)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap"
                      style={{
                        backgroundColor: activeCat === cat ? 'var(--color-accent)' : 'var(--color-surface)',
                        color: activeCat === cat ? 'var(--color-accent-fg)' : 'var(--color-text)',
                        border: '1px solid var(--color-border)',
                      }}>
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Item rows */}
        {visible.length === 0 ? (
          <div className="rounded-xl p-6 text-center mb-3"
               style={{ backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)' }}>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {items.length === 0
                ? t('itemsManage.empty', 'No items yet. Add your first, or load a template above.')
                : t('itemsManage.emptyCategory', 'No items in this segment.')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 mb-3">
            {visible.map((item) => (
              <button key={item.id} type="button" onClick={() => setEditing(item)}
                      className="rounded-xl p-3 flex items-center gap-3 text-left"
                      style={{ backgroundColor: 'var(--color-surface)',
                               border: '1px solid var(--color-border)' }}>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>
                    {item.name}
                  </div>
                  {item.category && (
                    <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-faint)' }}>
                      {item.category}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>
                    {item.unitPriceSek.toFixed(2)} SEK
                  </div>
                  <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {t('itemsManage.vatPercent', 'VAT {{rate}}%', { rate: item.vatRate })}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        <PrimaryButton onClick={() => setShowAdd(true)}>
          {t('itemsManage.add', '+ Add new item')}
        </PrimaryButton>

        {items.length > 0 && (
          <p className="text-xs mt-3 text-center"
             style={{ color: 'var(--color-text-faint)' }}>
            {t('itemsManage.totalCount', '{{count}} items in catalogue', { count: items.length })}
          </p>
        )}
      </div>

      {/* Edit modal */}
      {editing && (
        <ItemEditor
          initial={editing}
          existingCategories={categories}
          onCancel={() => setEditing(null)}
          onSave={async (patch, opts) => {
            await updateItem(editing.id, patch);
            // Wave 12 — if stock tracking was just enabled and the
            // merchant gave an opening count, record the `initial`
            // movement once (only when the item had no tracking before).
            if (opts?.initialStock !== undefined && !editing.trackStock) {
              const { setInitialStock } = await import('../../services/inventory');
              await setInitialStock({ ...editing, ...patch }, opts.initialStock);
            }
            setEditing(null);
            await refresh();
          }}
          onDelete={async () => {
            setEditing(null);
            await handleDelete(editing.id);
          }}
        />
      )}

      {/* Add modal */}
      {showAdd && (
        <ItemEditor
          initial={null}
          existingCategories={categories}
          onCancel={() => setShowAdd(false)}
          onSave={async (patch, opts) => {
            const created = await addItem({
              name: patch.name ?? '',
              unitPriceSek: patch.unitPriceSek ?? 0,
              vatRate: patch.vatRate ?? 12,
              category: patch.category,
              trackStock: patch.trackStock,
              lowStockThreshold: patch.lowStockThreshold,
            });
            if (patch.trackStock && opts?.initialStock !== undefined) {
              const { setInitialStock } = await import('../../services/inventory');
              await setInitialStock(created, opts.initialStock);
            }
            setShowAdd(false);
            await refresh();
          }}
          onDelete={null}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// ItemEditor — modal for add + edit. The on-save patch is partial; the
// caller decides whether to create or update.
// ───────────────────────────────────────────────────────────────────────

function ItemEditor({
  initial,
  existingCategories,
  onCancel,
  onSave,
  onDelete,
}: {
  initial: CatalogueItem | null;
  existingCategories: string[];
  onCancel: () => void;
  onSave: (
    patch: Partial<Omit<CatalogueItem, 'id' | 'updatedAt'>>,
    opts?: { initialStock?: number },
  ) => void | Promise<void>;
  onDelete: (() => void | Promise<void>) | null;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? '');
  const [price, setPrice] = useState(initial ? initial.unitPriceSek.toString() : '');
  const [vatRate, setVatRate] = useState<0 | 6 | 12 | 25>(initial?.vatRate ?? 12);
  const [category, setCategory] = useState(initial?.category ?? '');
  const [showCustomCat, setShowCustomCat] = useState(false);
  // Wave 12 — stock tracking. `trackStock` is the opt-in toggle.
  // `openingCount` is only used when tracking is being newly enabled
  // on an item that wasn't tracked before.
  const [trackStock, setTrackStock] = useState(initial?.trackStock ?? false);
  const [openingCount, setOpeningCount] = useState('');
  const wasTracked = initial?.trackStock ?? false;

  const numericPrice = Number.parseFloat(price.replace(',', '.'));
  const canSave = name.trim().length > 0 && Number.isFinite(numericPrice) && numericPrice >= 0;
  /** Show the opening-count field only when tracking is freshly
   *  enabled — an already-tracked item's stock is changed from the
   *  Inventory screen, never silently here. */
  const showOpeningCount = trackStock && !wasTracked;

  async function handleSave() {
    if (!canSave) return;
    const opening = Number.parseInt(openingCount, 10);
    await onSave(
      {
        name: name.trim(),
        unitPriceSek: numericPrice,
        vatRate,
        category: category.trim() || undefined,
        trackStock,
        ...(initial?.lowStockThreshold !== undefined
          ? { lowStockThreshold: initial.lowStockThreshold }
          : {}),
      },
      showOpeningCount && Number.isInteger(opening) && opening >= 0
        ? { initialStock: opening }
        : undefined,
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end"
         style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full rounded-t-2xl pt-4 pb-6 px-5"
           style={{ backgroundColor: 'var(--color-bg)',
                    maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex justify-center mb-3">
          <div style={{ width: 36, height: 4, borderRadius: 2,
                        backgroundColor: 'var(--color-border)' }} />
        </div>

        <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--color-text)' }}>
          {initial ? t('itemsManage.editTitle', 'Edit item') : t('itemsManage.addTitle', 'New item')}
        </h3>

        <Field label={t('itemsManage.fieldName', 'Name')}
               value={name} onChange={setName}
               placeholder={t('itemsManage.fieldNamePlaceholder', 'e.g. Cappuccino')} />

        <Field label={t('itemsManage.fieldPrice', 'Price (SEK)')}
               value={price} onChange={setPrice}
               inputMode="decimal"
               placeholder="0.00" />

        <div className="mb-4">
          <div className="text-xs font-semibold mb-2 uppercase tracking-wider"
               style={{ color: 'var(--color-text-faint)' }}>
            {t('itemsManage.fieldVat', 'VAT rate')}
          </div>
          <div className="flex gap-2">
            {VAT_RATES.map((r) => (
              <button key={r} type="button" onClick={() => setVatRate(r)}
                      className="flex-1 py-2 rounded-lg text-sm font-semibold"
                      style={{
                        backgroundColor: vatRate === r ? 'var(--color-accent)' : 'var(--color-surface)',
                        color: vatRate === r ? 'var(--color-accent-fg)' : 'var(--color-text)',
                        border: '1px solid var(--color-border)',
                      }}>
                {r}%
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <div className="text-xs font-semibold mb-2 uppercase tracking-wider"
               style={{ color: 'var(--color-text-faint)' }}>
            {t('itemsManage.fieldCategory', 'Segment (optional)')}
          </div>
          {showCustomCat ? (
            <input value={category} onChange={(e) => setCategory(e.target.value)}
                   placeholder={t('itemsManage.fieldCategoryPlaceholder', 'e.g. Espresso')}
                   className="w-full px-3 py-2 rounded-lg text-sm"
                   style={{ backgroundColor: 'var(--color-surface)',
                            border: '1px solid var(--color-border)',
                            color: 'var(--color-text)' }} />
          ) : (
            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={() => setCategory('')}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold"
                      style={{
                        backgroundColor: category === '' ? 'var(--color-accent)' : 'var(--color-surface)',
                        color: category === '' ? 'var(--color-accent-fg)' : 'var(--color-text)',
                        border: '1px solid var(--color-border)',
                      }}>
                {t('itemsManage.noCategory', 'None')}
              </button>
              {existingCategories.map((c) => (
                <button key={c} type="button" onClick={() => setCategory(c)}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold"
                        style={{
                          backgroundColor: category === c ? 'var(--color-accent)' : 'var(--color-surface)',
                          color: category === c ? 'var(--color-accent-fg)' : 'var(--color-text)',
                          border: '1px solid var(--color-border)',
                        }}>
                  {c}
                </button>
              ))}
              <button type="button" onClick={() => setShowCustomCat(true)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold"
                      style={{
                        backgroundColor: 'var(--color-surface)',
                        color: 'var(--color-accent)',
                        border: '1px solid var(--color-accent)',
                      }}>
                {t('itemsManage.newCategory', '+ new')}
              </button>
            </div>
          )}
        </div>

        {/* Wave 12 — stock tracking toggle. Opt-in per item; service
            items leave it off. When freshly enabled, an opening-count
            field appears so the merchant can seed the inventory. */}
        <div className="mb-4">
          <label className="flex items-center gap-3" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={trackStock}
                   onChange={(e) => setTrackStock(e.target.checked)}
                   style={{ width: 18, height: 18, accentColor: 'var(--color-accent)' }} />
            <span className="flex-1">
              <span className="text-sm font-semibold block" style={{ color: 'var(--color-text)' }}>
                {t('itemsManage.trackStock', 'Track stock')}
              </span>
              <span className="text-xs block mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                {t('itemsManage.trackStockHint',
                  'Count this item in Inventory and deduct it on every sale.')}
              </span>
            </span>
          </label>
          {showOpeningCount && (
            <input value={openingCount} onChange={(e) => setOpeningCount(e.target.value)}
                   type="number" inputMode="numeric"
                   placeholder={t('itemsManage.openingCount', 'Opening stock count')}
                   className="w-full mt-2" />
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onCancel}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold"
                  style={{ backgroundColor: 'var(--color-surface)',
                           border: '1px solid var(--color-border)',
                           color: 'var(--color-text)' }}>
            {t('common.cancel', 'Cancel')}
          </button>
          <button type="button" onClick={handleSave} disabled={!canSave}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold"
                  style={{ backgroundColor: 'var(--color-accent)',
                           color: 'var(--color-accent-fg)',
                           opacity: canSave ? 1 : 0.5 }}>
            {t('common.save', 'Save')}
          </button>
        </div>

        {onDelete && (
          <button type="button" onClick={onDelete}
                  className="w-full py-3 mt-2 rounded-xl text-sm font-semibold"
                  style={{ backgroundColor: 'transparent',
                           color: '#C0392B' }}>
            {t('itemsManage.delete', 'Delete item')}
          </button>
        )}
      </div>
    </div>
  );
}
