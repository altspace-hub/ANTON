/**
 * ItemsSetupScreen — onboarding step 4, Extended mode only.
 *
 * Lets the merchant seed their item catalogue. They can:
 *   - Tap "Add starter items" to drop in 6 sample SKUs (Coffee/Tea/
 *     Cinnamon bun/Sandwich/Beer/House wine), useful for café/bar
 *     style operations
 *   - Manually add their own
 *   - Skip and add items later from Settings → Items
 *
 * On continue the items live in secure-store; Extended-mode sale
 * screens read them.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PrimaryButton from '../../components/PrimaryButton';
import Field from '../../components/Field';
import {
  addItem,
  deleteItem,
  loadItems,
  seedSampleItems,
  type CatalogueItem,
} from '../../services/items';

export default function ItemsSetupScreen({ onContinue }: { onContinue: () => void }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [vatRate, setVatRate] = useState<0 | 6 | 12 | 25>(12);

  useEffect(() => {
    loadItems().then(setItems);
  }, []);

  async function add() {
    const p = parseFloat(price.replace(',', '.'));
    if (!name.trim() || !Number.isFinite(p) || p <= 0) return;
    const created = await addItem({
      name: name.trim(),
      unitPriceSek: p,
      vatRate,
    });
    setItems((arr) => [...arr, created]);
    setName('');
    setPrice('');
  }

  async function seed() {
    const seeded = await seedSampleItems();
    setItems(seeded);
  }

  async function remove(id: string) {
    await deleteItem(id);
    setItems((arr) => arr.filter((i) => i.id !== id));
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="p-6 pb-12 flex flex-col gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-1"
              style={{ color: 'var(--color-text)' }}>
            {t('items.title')}
          </h2>
          <p className="text-sm leading-snug"
             style={{ color: 'var(--color-text-muted)' }}>
            {t('items.subtitle')}
          </p>
        </div>

        {items.length === 0 && (
          <button
            type="button"
            onClick={seed}
            className="text-left p-4 rounded-xl"
            style={{
              backgroundColor: 'var(--color-accent-soft)',
              border: '1px dashed var(--color-accent)',
            }}
          >
            <div className="font-semibold" style={{ color: 'var(--color-accent)' }}>
              {t('items.addStarter')}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              {t('items.addStarterDesc')}
            </div>
          </button>
        )}

        {items.length > 0 && (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <div key={item.id}
                   className="flex items-center justify-between p-3 rounded-lg"
                   style={{
                     backgroundColor: 'var(--color-surface)',
                     border: '1px solid var(--color-border)',
                   }}>
                <div>
                  <div className="font-semibold" style={{ color: 'var(--color-text)' }}>
                    {item.name}
                  </div>
                  <div className="text-xs mono mt-0.5"
                       style={{ color: 'var(--color-text-faint)' }}>
                    {item.unitPriceSek.toFixed(2)} SEK · VAT {item.vatRate}%
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  className="px-2 py-1 text-xs rounded"
                  style={{ color: 'var(--color-error)' }}
                  aria-label={t('items.removeAria', { name: item.name })}
                >
                  {t('items.remove')}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-2 p-4 rounded-xl"
             style={{
               backgroundColor: 'var(--color-surface)',
               border: '1px solid var(--color-border)',
             }}>
          <div className="uppercase tracking-wider text-xs mb-2"
               style={{ color: 'var(--color-text-faint)' }}>
            {t('items.addNewItem')}
          </div>
          <Field label={t('items.name')} value={name} onChange={setName} placeholder="Coffee" />
          <Field label={t('items.priceSek')} value={price} onChange={setPrice}
                 placeholder="35" inputMode="decimal" autoCapitalize="none" />
          <div className="uppercase tracking-wider text-xs mb-1.5 mt-1"
               style={{ color: 'var(--color-text-faint)' }}>
            {t('items.vatRate')}
          </div>
          <div className="flex gap-2">
            {([0, 6, 12, 25] as const).map((r) => {
              const active = vatRate === r;
              return (
                <button
                  type="button"
                  key={r}
                  onClick={() => setVatRate(r)}
                  className="flex-1 py-2.5 rounded-lg font-semibold text-sm"
                  style={{
                    backgroundColor: active ? 'var(--color-accent)' : 'var(--color-bg)',
                    color: active ? 'var(--color-accent-fg)' : 'var(--color-text-muted)',
                    border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  }}
                >{r}%</button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={add}
            disabled={!name.trim() || !price.trim()}
            className="w-full mt-4 py-3 rounded-lg font-semibold text-sm transition-opacity"
            style={{
              backgroundColor: 'var(--color-accent-soft)',
              color: 'var(--color-accent)',
              opacity: (!name.trim() || !price.trim()) ? 0.5 : 1,
              border: '1px solid var(--color-accent-dim)',
            }}
          >
            {t('items.addItem')}
          </button>
        </div>

        <div className="flex flex-col gap-2 mt-4">
          <PrimaryButton onClick={onContinue} marginTopAuto={false}>
            {items.length === 0 ? t('items.skipForNow') : t('items.continue')}
          </PrimaryButton>
          {items.length === 0 && (
            <p className="text-center text-xs"
               style={{ color: 'var(--color-text-faint)' }}>
              {t('items.addLater')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
