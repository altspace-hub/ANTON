/**
 * Settings → Items — CRUD on the catalogue. v0: tap to edit inline.
 * No drag-to-reorder; items show in update-order (most recent first).
 */
import { useEffect, useState } from 'react';
import {
  FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import {
  addItem,
  deleteItem,
  loadItems,
  seedSampleItems,
  updateItem,
  type CatalogueItem,
} from '../../src/services/items';

interface DraftForm {
  id?: string;
  name: string;
  priceText: string;
  vatRate: 0 | 6 | 12 | 25;
  category: string;
}

const EMPTY: DraftForm = { name: '', priceText: '', vatRate: 12, category: '' };

export default function Items() {
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [draft, setDraft] = useState<DraftForm>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setItems((await loadItems()).sort((a, b) => b.updatedAt - a.updatedAt));
  }

  function startEdit(item: CatalogueItem) {
    setError(null);
    setDraft({
      id: item.id,
      name: item.name,
      priceText: item.unitPriceSek.toFixed(2),
      vatRate: item.vatRate,
      category: item.category ?? '',
    });
  }

  function cancelEdit() {
    setDraft(EMPTY);
    setError(null);
  }

  async function save() {
    const price = Number.parseFloat(draft.priceText);
    if (!draft.name.trim()) { setError('Name is required.'); return; }
    if (!Number.isFinite(price) || price <= 0) { setError('Price must be a positive number.'); return; }
    setError(null);
    const payload = {
      name: draft.name.trim(),
      unitPriceSek: price,
      vatRate: draft.vatRate,
      category: draft.category.trim() || undefined,
    };
    if (draft.id) {
      await updateItem(draft.id, payload);
    } else {
      await addItem(payload);
    }
    setDraft(EMPTY);
    await refresh();
  }

  async function remove(id: string) {
    await deleteItem(id);
    if (draft.id === id) setDraft(EMPTY);
    await refresh();
  }

  async function seed() {
    await seedSampleItems();
    await refresh();
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0F1B2D' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={s.heading}>{draft.id ? 'Edit item' : 'New item'}</Text>

        <View style={s.field}>
          <Text style={s.label}>Name</Text>
          <TextInput
            style={s.input}
            value={draft.name}
            onChangeText={(v) => setDraft((d) => ({ ...d, name: v }))}
            placeholder="Coffee"
            placeholderTextColor="#4F5267"
            autoCorrect={false}
          />
        </View>

        <View style={s.row2}>
          <View style={[s.field, { flex: 1 }]}>
            <Text style={s.label}>Price SEK</Text>
            <TextInput
              style={s.input}
              value={draft.priceText}
              onChangeText={(v) => setDraft((d) => ({ ...d, priceText: v }))}
              placeholder="35.00"
              placeholderTextColor="#4F5267"
              keyboardType="decimal-pad"
            />
          </View>
          <View style={[s.field, { flex: 1 }]}>
            <Text style={s.label}>Category (optional)</Text>
            <TextInput
              style={s.input}
              value={draft.category}
              onChangeText={(v) => setDraft((d) => ({ ...d, category: v }))}
              placeholder="Drinks"
              placeholderTextColor="#4F5267"
              autoCorrect={false}
            />
          </View>
        </View>

        <Text style={s.label}>VAT rate</Text>
        <View style={s.vatRow}>
          {([0, 6, 12, 25] as const).map((r) => (
            <Pressable
              key={r}
              onPress={() => setDraft((d) => ({ ...d, vatRate: r }))}
              style={[s.vatChip, draft.vatRate === r && s.vatChipActive]}
            >
              <Text style={[s.vatChipText, draft.vatRate === r && s.vatChipTextActive]}>{r}%</Text>
            </Pressable>
          ))}
        </View>

        {error && <Text style={s.err}>{error}</Text>}

        <View style={s.btnRow}>
          {draft.id && (
            <Pressable style={s.cancelBtn} onPress={cancelEdit}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </Pressable>
          )}
          <Pressable style={[s.saveBtn, !draft.name && s.saveBtnDisabled]} onPress={save} disabled={!draft.name}>
            <Text style={s.saveBtnText}>{draft.id ? 'Save changes' : 'Add item'}</Text>
          </Pressable>
        </View>

        <View style={s.listHeader}>
          <Text style={s.heading}>Catalogue · {items.length}</Text>
          {items.length === 0 && (
            <Pressable style={s.seedBtn} onPress={seed}>
              <Text style={s.seedBtnText}>Load sample items</Text>
            </Pressable>
          )}
        </View>

        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          scrollEnabled={false}
          ListEmptyComponent={
            <Text style={s.empty}>No items yet.</Text>
          }
          renderItem={({ item }) => (
            <View style={s.itemRow}>
              <Pressable style={s.itemLeft} onPress={() => startEdit(item)}>
                <Text style={s.itemName}>{item.name}</Text>
                <Text style={s.itemMeta}>
                  {item.unitPriceSek.toFixed(2)} SEK · VAT {item.vatRate}%
                  {item.category ? ` · ${item.category}` : ''}
                </Text>
              </Pressable>
              <Pressable style={s.itemDelete} onPress={() => remove(item.id)}>
                <Text style={s.itemDeleteText}>Delete</Text>
              </Pressable>
            </View>
          )}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 48 },
  heading: { color: '#E0E0E0', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  field: { marginBottom: 12 },
  row2: { flexDirection: 'row', gap: 12 },
  label: { color: '#7F8A9C', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  input: {
    backgroundColor: '#152238',
    color: '#E0E0E0',
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  vatRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  vatChip: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: '#152238' },
  vatChipActive: { backgroundColor: '#2DD4A8' },
  vatChipText: { color: '#B0B0B0', fontWeight: '600' },
  vatChipTextActive: { color: '#0B1426' },
  err: { color: '#E74C3C', fontSize: 14, marginBottom: 8 },
  btnRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', backgroundColor: '#152238' },
  cancelBtnText: { color: '#B0B0B0', fontWeight: '600' },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', backgroundColor: '#2DD4A8' },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#0B1426', fontWeight: '700' },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  seedBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#3B3D50' },
  seedBtnText: { color: '#E0E0E0', fontSize: 13 },
  empty: { color: '#7F8A9C', fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  itemRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#152238', padding: 12, borderRadius: 10, marginBottom: 8 },
  itemLeft: { flex: 1 },
  itemName: { color: '#E0E0E0', fontSize: 15, fontWeight: '600' },
  itemMeta: { color: '#7F8A9C', fontSize: 12, marginTop: 2 },
  itemDelete: { paddingHorizontal: 10, paddingVertical: 6 },
  itemDeleteText: { color: '#E74C3C', fontSize: 13 },
});
