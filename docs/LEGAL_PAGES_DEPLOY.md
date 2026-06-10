# Legal pages (terms.futurechain.eu) — deploy guide

**Status 2026-06-10:** code shipped, awaiting operator DNS + deploy.

## What exists in the repo

- `relay/src/legal-pages.ts` — self-contained Terms of Service + Privacy Policy
  + index pages (no JS, inline CSS, blue-chevron accent). Copy is **DRAFT,
  clearly bannered**, with `[OPERATOR: …]` placeholders for counsel.
- `relay/src/server.ts` — serves them on the existing relay HTTP listener:
  `/terms`, `/privacy`, `/legal`, `/legal/terms`, `/legal/privacy` on any
  hostname, **plus `/` when the Host header starts with `terms.`** (the relay
  root stays a 404 otherwise).
- `relay/tests/ops-endpoints.test.ts` — 7 new assertions (all green).
- `src/pay/components/RiskDisclosureSheet.tsx` — TERMS_URL/PRIVACY_URL now point
  at `https://terms.futurechain.eu/{terms,privacy}` instead of the parked
  `futurechain.eu/legal/*` (which currently serves a **GoDaddy ad lander with
  HTTP 200** — worse than a 404, and why the swap shouldn't wait for DNS).

## Operator steps (≈15 min once DNS propagates)

### 1. GoDaddy DNS (user said: in a day or two)

Add either record for `terms.futurechain.eu`:

- **CNAME** `terms` → `relay.futurechain.eu` (preferred — survives IP changes), or
- **A** `terms` → the Bahnhof box's IP.

### 2. Caddy site on the Bahnhof box

Caddy already fronts `relay.futurechain.eu` and auto-manages Let's Encrypt
certs (RUNBOOK §4). Add a site for the new hostname pointing at the same
relay upstream, e.g. in the Caddyfile:

```
terms.futurechain.eu {
    reverse_proxy localhost:8443   # same upstream as relay.futurechain.eu
}
```

Then `sudo systemctl reload caddy`. Caddy fetches the cert automatically once
DNS resolves (port 80 must remain reachable for ACME).

### 3. Deploy the relay code (flat-file copy — RUNBOOK §12.1 pattern)

The Bahnhof deploy dir (`ubuntu@relay.futurechain.eu:~/anton-relay`) is a flat
copy, **not** a git checkout. No new npm deps, no migration for this feature:

```bash
# From the repo's relay/ dir on the dev box (back up remote src first per RUNBOOK):
tar czf - src/legal-pages.ts src/server.ts \
  | ssh ubuntu@relay.futurechain.eu 'tar xzf - -C anton-relay'
ssh ubuntu@relay.futurechain.eu 'cd anton-relay && docker compose build relay && docker compose up -d relay'
```

> ⚠️ **Deploy drift note:** the production box was last synced 2026-06-01 and
> is missing commit `e4a39037` (Comm FCM wake-push + `migrations/003_comm_push_tokens.sql`).
> Recommended: sync the **whole** current `relay/src` + `migrations/` in this
> pass and run `docker compose run --rm relay node dist/registry/migrate.js`
> (expect `003` to apply), so prod stops drifting from the repo.

### 4. Verify

```bash
# Works immediately after deploy, even before DNS:
curl -s https://relay.futurechain.eu/legal/terms | grep -o 'Terms of Service' | head -1
# After DNS + Caddy:
curl -s https://terms.futurechain.eu/terms   | grep -o 'Terms of Service' | head -1
curl -s https://terms.futurechain.eu/privacy | grep -o 'Privacy Policy'   | head -1
curl -s https://terms.futurechain.eu/        | grep -o 'FutureChain — Legal' | head -1
```

## Counsel handoff (before launch — GO_LIVE_CHECKLIST §5)

1. Counsel reviews/edits the draft copy in `relay/src/legal-pages.ts`
   (Terms §1–10, Privacy §1–8). Fill every `[OPERATOR: …]` placeholder
   (legal entity, contact emails, log-retention period, DPA status, DPO).
2. Remove the DRAFT banner (`page()` in `legal-pages.ts` and the operator
   note at the top of the file).
3. Bump `DISCLOSURE_VERSION` in `src/pay/services/disclosure.ts` so Pay users
   re-accept against the final text; translate the `disclosure.*` strings
   (currently English-only — tracked separately).
4. Redeploy the relay (step 3 above) and rebuild Pay.
5. Use `https://terms.futurechain.eu/privacy` as the privacy-policy URL on all
   four Play Store listings (Play requires a live URL per listing).
