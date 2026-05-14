/**
 * Extended mode — item picker + cart + QR.
 *
 * Sprint 2 task 2. The merchant taps items from their catalogue to
 * build a cart, sees per-line totals + the running VAT breakdown, and
 * generates a QR with the ADR-004 v1 I/V/D tokens populated.
 */
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import {
  addLine,
  computeTotals,
  empty,
  removeLine,
  setQuantity,
  type Cart,
  type CartLine,
} from '../src/services/cart';
import {
  loadItems,
  seedSampleItems,
  type CatalogueItem,
} from '../src/services/items';
import { loadConfig, type MerchantConfig } from '../src/services/merchant';
import {
  buildExtendedQr,
  computeMerchantId,
  generateOrderId,
  type BuiltQr,
} from '../src/services/qr';
import { loadWallet } from '../src/services/wallet';

type Phase = 'cart' | 'qr';

export default function Extended() {
  const [config, setConfig] = useState<MerchantConfig | null>(null);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [cart, setCart] = useState<Cart>(empty());
  const [phase, setPhase] = useState<Phase>('cart');
  const [built, setBuilt] = useState<BuiltQr | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [cfg, wallet, list] = await Promise.all([
        loadConfig(), loadWallet(), loadItems(),
      ]);
      setConfig(cfg);
      if (cfg && wallet) setMerchantId(computeMerchantId(cfg.orgNr, wallet.address));
      setItems(list);
    })();
  }, []);

  const totals = useMemo(() => computeTotals(cart), [cart]);

  async function loadSamples() {
    const seeded = await seedSampleItems();
    setItems(seeded);
  }

  function addToCart(item: CatalogueItem) {
    setError(null);
    setCart((c) => addLine(c, {
      itemId: item.id,
      name: item.name,
      unitPriceSek: item.unitPriceSek,
      vatRate: item.vatRate,
    }));
  }

  function bumpQuantity(line: CartLine, delta: number) {
    setCart((c) => setQuantity(c, line.itemId, line.quantity + delta));
  }

  function dropLine(line: CartLine) {
    setCart((c) => removeLine(c, line.itemId));
  }

  function clear() {
    setCart(empty());
    setBuilt(null);
    setPhase('cart');
    setError(null);
  }

  function generateQr() {
    if (!config || !merchantId) {
      setError('Merchant not configured.');
      return;
    }
    if (totals.totalSek <= 0) {
      setError('Cart is empty.');
      return;
    }
    try {
      const built = buildExtendedQr({
        toAddress: config.safelloReceiveAddress,
        merchantId,
        orderId: generateOrderId(),
        amountSek: totals.totalSek,
        ftcPerSek: config.ftcPerSek,
        purpose: 'RESTAURANT',
        itemCount: totals.itemCount,
        vatSek: totals.totalVatSek,
        discountSek: totals.discountSek > 0 ? totals.discountSek : undefined,
      });
      setBuilt(built);
      setPhase('qr');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!config || !merchantId) {
    return (
      <View style={s.container}>
        <Text style={s.loading}>Loading…</Text>
      </View>
    );
  }

  if (phase === 'qr' && built) {
    return (
      <QrPhase
        totals={totals}
        cart={cart}
        merchantName={config.legalName}
        built={built}
        onCancel={clear}
        onNext={() => { clear(); router.replace('/home'); }}
      />
    );
  }

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Cart summary */}
        <View style={s.cartBox}>
          <Text style={s.label}>Cart</Text>
          {cart.lines.length === 0 ? (
            <Text style={s.cartEmpty}>Tap an item below to add it.</Text>
          ) : (
            <View>
              {cart.lines.map((line) => (
                <View key={line.itemId} style={s.cartLine}>
                  <View style={s.cartLineLeft}>
                    <Text style={s.cartLineName}>{line.name}</Text>
                    <Text style={s.cartLineMeta}>
                      {line.unitPriceSek.toFixed(2)} × {line.quantity}  ·  VAT {line.vatRate}%
                    </Text>
                  </View>
                  <View style={s.cartLineRight}>
                    <Pressable style={s.qtyBtn} onPress={() => bumpQuantity(line, -1)}>
                      <Text style={s.qtyBtnText}>−</Text>
                    </Pressable>
                    <Text style={s.qtyValue}>{line.quantity}</Text>
                    <Pressable style={s.qtyBtn} onPress={() => bumpQuantity(line, 1)}>
                      <Text style={s.qtyBtnText}>+</Text>
                    </Pressable>
                    <Pressable style={s.dropBtn} onPress={() => dropLine(line)}>
                      <Text style={s.dropBtnText}>×</Text>
                    </Pressable>
                  </View>
                </View>
              ))}

              <View style={s.totalsBox}>
                <View style={s.totalRow}>
                  <Text style={s.totalLabel}>Subtotal</Text>
                  <Text style={s.totalValue}>{totals.subtotalSek.toFixed(2)} SEK</Text>
                </View>
                {totals.vatBreakdown.map((e) => (
                  <View key={e.rate} style={s.totalRow}>
                    <Text style={s.totalLabelSmall}>VAT {e.rate}%</Text>
                    <Text style={s.totalValueSmall}>{e.vatSek.toFixed(2)} SEK</Text>
                  </View>
                ))}
                <View style={[s.totalRow, s.totalRowBig]}>
                  <Text style={s.totalLabelBig}>Total</Text>
                  <Text style={s.totalValueBig}>{totals.totalSek.toFixed(2)} SEK</Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Item picker */}
        <Text style={s.label}>Items</Text>
        {items.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyText}>
              You haven&apos;t added any items yet. Edit your catalogue from
              the Home → Settings menu, or seed a quick demo set:
            </Text>
            <Pressable style={s.seedBtn} onPress={loadSamples}>
              <Text style={s.seedBtnText}>Load sample items</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <Pressable style={s.itemRow} onPress={() => addToCart(item)}>
                <View style={s.itemRowLeft}>
                  <Text style={s.itemName}>{item.name}</Text>
                  {item.category && <Text style={s.itemCategory}>{item.category}</Text>}
                </View>
                <Text style={s.itemPrice}>{item.unitPriceSek.toFixed(2)} SEK</Text>
                <Text style={s.itemPlus}>+</Text>
              </Pressable>
            )}
          />
        )}
      </ScrollView>

      {error && <Text style={s.err}>{error}</Text>}

      <Pressable
        style={[s.cta, totals.totalSek <= 0 && s.ctaDisabled]}
        disabled={totals.totalSek <= 0}
        onPress={generateQr}
      >
        <Text style={s.ctaText}>
          Charge {totals.totalSek > 0 ? totals.totalSek.toFixed(2) + ' SEK' : ''}
        </Text>
      </Pressable>
    </View>
  );
}

function QrPhase({
  totals, cart, merchantName, built, onCancel, onNext,
}: {
  totals: ReturnType<typeof computeTotals>;
  cart: Cart;
  merchantName: string;
  built: BuiltQr;
  onCancel: () => void;
  onNext: () => void;
}) {
  const amountFtc = Number(built.amountMicroFtc) / 1_000_000;
  return (
    <View style={s.qrContainer}>
      <Text style={s.qrAmount}>{totals.totalSek.toFixed(2)} SEK</Text>
      <Text style={s.qrFtc}>{amountFtc.toFixed(4)} FTC · {totals.itemCount} items</Text>
      <Text style={s.qrMerchant}>{merchantName}</Text>

      <View style={s.qrCard}>
        <QRCode value={built.uri} size={240} color="#0B1426" backgroundColor="#E0E0E0" />
      </View>

      <Text style={s.qrHelper}>Customer scans with ANTON Comm to pay.</Text>
      <Text style={s.qrInv}>Order {built.inv}</Text>

      <View style={s.qrActions}>
        <Pressable style={s.qrCancel} onPress={onCancel}>
          <Text style={s.qrCancelText}>Cancel</Text>
        </Pressable>
        <Pressable style={s.qrNext} onPress={onNext}>
          <Text style={s.qrNextText}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1B2D' },
  scroll: { padding: 20 },
  loading: { color: '#B0B0B0', textAlign: 'center', marginTop: 40 },

  label: { color: '#7F8A9C', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 16 },

  cartBox: { backgroundColor: '#152238', borderRadius: 14, padding: 16, marginBottom: 8 },
  cartEmpty: { color: '#7F8A9C', fontSize: 14, paddingVertical: 12, textAlign: 'center' },
  cartLine: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1F2D44' },
  cartLineLeft: { flex: 1 },
  cartLineName: { color: '#E0E0E0', fontSize: 15, fontWeight: '600' },
  cartLineMeta: { color: '#7F8A9C', fontSize: 12, marginTop: 2 },
  cartLineRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#3B3D50', alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { color: '#E0E0E0', fontSize: 18, fontWeight: '600' },
  qtyValue: { color: '#E0E0E0', fontSize: 15, fontVariant: ['tabular-nums'], width: 22, textAlign: 'center' },
  dropBtn: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  dropBtnText: { color: '#E74C3C', fontSize: 18, fontWeight: '700' },

  totalsBox: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#1F2D44' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 3 },
  totalLabel: { color: '#B0B0B0', fontSize: 14 },
  totalValue: { color: '#E0E0E0', fontSize: 14, fontVariant: ['tabular-nums'] },
  totalLabelSmall: { color: '#7F8A9C', fontSize: 12 },
  totalValueSmall: { color: '#7F8A9C', fontSize: 12, fontVariant: ['tabular-nums'] },
  totalRowBig: { marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#1F2D44' },
  totalLabelBig: { color: '#E0E0E0', fontSize: 18, fontWeight: '700' },
  totalValueBig: { color: '#2DD4A8', fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },

  empty: { backgroundColor: '#152238', borderRadius: 14, padding: 20, alignItems: 'center' },
  emptyText: { color: '#B0B0B0', fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 16 },
  seedBtn: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, backgroundColor: '#3B3D50' },
  seedBtnText: { color: '#E0E0E0', fontSize: 14, fontWeight: '600' },

  itemRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#152238', padding: 14, borderRadius: 10, marginBottom: 8 },
  itemRowLeft: { flex: 1 },
  itemName: { color: '#E0E0E0', fontSize: 15, fontWeight: '600' },
  itemCategory: { color: '#7F8A9C', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 },
  itemPrice: { color: '#B0B0B0', fontSize: 14, fontVariant: ['tabular-nums'], marginRight: 12 },
  itemPlus: { color: '#2DD4A8', fontSize: 22, fontWeight: '300' },

  err: { color: '#E74C3C', fontSize: 14, textAlign: 'center', paddingHorizontal: 20 },

  cta: { backgroundColor: '#2DD4A8', paddingVertical: 18, borderRadius: 12, alignItems: 'center', margin: 20 },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: '#0B1426', fontSize: 18, fontWeight: '700' },

  qrContainer: { flex: 1, padding: 24, backgroundColor: '#0F1B2D', alignItems: 'center' },
  qrAmount: { color: '#E0E0E0', fontSize: 40, fontWeight: '300', marginTop: 16, fontVariant: ['tabular-nums'] },
  qrFtc: { color: '#2DD4A8', fontSize: 14, fontFamily: 'Courier', marginTop: 4 },
  qrMerchant: { color: '#B0B0B0', fontSize: 15, marginTop: 8, marginBottom: 20 },
  qrCard: { backgroundColor: '#E0E0E0', padding: 18, borderRadius: 14 },
  qrHelper: { color: '#7F8A9C', fontSize: 14, marginTop: 16, textAlign: 'center' },
  qrInv: { color: '#4F5267', fontSize: 12, fontFamily: 'Courier', marginTop: 8 },
  qrActions: { flexDirection: 'row', gap: 12, marginTop: 'auto', alignSelf: 'stretch' },
  qrCancel: { flex: 1, paddingVertical: 16, borderRadius: 12, borderWidth: 1, borderColor: '#3B3D50', alignItems: 'center' },
  qrCancelText: { color: '#B0B0B0', fontSize: 16, fontWeight: '600' },
  qrNext: { flex: 1, paddingVertical: 16, borderRadius: 12, backgroundColor: '#2DD4A8', alignItems: 'center' },
  qrNextText: { color: '#0B1426', fontSize: 16, fontWeight: '700' },
});
