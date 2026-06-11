# FutureChain Branding — the chain mark inside the ANTON apps

The FutureChain logo brands **FutureChain-the-chain** inside the apps. It is
**not** an app identity: the per-app launcher icons and brand chevrons are
locked (Pay = sunrise orange, Business = blue `#3070C7`, Comm = teal,
Companion = green) and must never be replaced by this mark.

## Source assets

`docs/logos_fc_small/` — four square ~1254×1254 PNGs, all the same
F-wing + gold orbital-arc mark on a solid background:

| File | Background | Mark | Use |
|---|---|---|---|
| `fc_blue.png` | Royal blue `#013DD1` | White F-wing + gold arc | **PRIMARY** (user decision 2026-06-11) |
| `fc_gold.png` | Gold | White F-wing + white arc | Accent / print alternates |
| `fc_lightblue.png` | Pale blue | Blue F-wing + gold arc | Light alternates |
| `fc_white.png` | White | Blue F-wing + gold arc | Dark/blue surfaces where blue-on-blue fails |

## Circle variants (generated)

`scripts/make-fc-logos.cjs` (sharp — already in the tree) produces
circle-masked variants: transparent outside the circle, the square's
background colour fills the disc, mark centered.

```
node scripts/make-fc-logos.cjs
```

Output → `public/branding/futurechain/`:

- `fc_<name>_circle_<size>.png` for each palette (`blue`, `gold`,
  `lightblue`, `white`) at sizes **512 / 192 / 96 / 48**
- `fc_blue_circle.svg` — self-contained PNG-in-circle SVG wrapper
  (base64-embedded 192 px master) for inline web use

ANTON Local serves these directly at `/branding/futurechain/…`. The
mobile apps each carry a bundled copy of `fc_blue_circle_96.png` in
their own assets dir (ES-imported, so Vite hashes it and Capacitor
`base: './'` builds resolve it):

- `src/pay/assets/fc_blue_circle_96.png` + `src/pay/components/FcLogo.tsx`
- `src/comm/assets/fc_blue_circle_96.png` + `src/comm/components/FcLogo.tsx`
- `src/business/assets/fc_blue_circle_96.png` + `src/business/components/FcLogo.tsx`
- `src/app/assets/fc_blue_circle_96.png` (inline `<img>`, Companion has no i18n)

## Sizing + accessibility rules

- Inline rows / chips: **16–24 px**. Headers: **28–48 px**.
- The 96 px source covers up to ~32 px at 3× DPR; use the 192/512
  outputs for anything larger.
- `FcLogo` takes `decorative` — set it whenever adjacent text already
  says "FutureChain" (renders `alt=""` + `aria-hidden`). Standalone
  usage gets `alt={t('brand.futurechain', 'FutureChain')}` (key added
  to en + sv; the brand name is identical in every locale, so the
  English fallback is correct everywhere).

## Where it is integrated (2026-06-11)

**ANTON Pay** (`src/pay/`):
- `pages/HomeScreen.tsx` — wallet chip, 16 px mark before the FTC unit
- `pages/settings/SettingsScreen.tsx` — Network → RPC endpoint row, 24 px leading icon (`NavCard` gained an optional `leading` prop)
- `pages/PaymentDoneScreen.tsx` — "FutureChain" settlement chip (16 px) shown only for chain-touching states (queued / accepted / confirmed), never the local-only receipt

**ANTON Comm** (`src/comm/`):
- `pages/wallet/WalletBalanceScreen.tsx` — balance card, 16 px mark before the FTC unit
- `pages/wallet/WalletTxDetailScreen.tsx` — Chain section, "Network · FutureChain" row (16 px)
- `pages/wallet/RpcEndpointScreen.tsx` — screen header, 28 px

**ANTON Business** (`src/business/`):
- `pages/settings/SettingsScreen.tsx` — Network → RPC endpoint row, 24 px leading icon
- `pages/SimpleScreen.tsx` + `pages/ExtendedScreen.tsx` — QR payment phase, "FutureChain" chip (16 px) under the order line

**Companion App** (`src/app/`):
- `pages/WalletScreen.tsx` — "About FutureChain" card header, 20 px

**ANTON Local** (`src/pages/`):
- `futurechain/FCDashboardPage.tsx` — pillar page header, 32 px (replaces the generic Wallet icon), served from `/branding/futurechain/`

Palette per spot: **blue everywhere**. All integrated surfaces are
light (`--color-surface`) or near-black desaturated cards; `#013DD1`
plus the white mark and gold arc reads clearly on both. Switch to
`fc_white_circle_*` / `fc_lightblue_circle_*` only if a future spot
puts the mark on a saturated blue surface.

Relay legal pages get nothing (operator-deployed, out of repo scope).
