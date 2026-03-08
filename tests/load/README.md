# Load Tests — openEXPERT API

TEST-06: k6-based load test suite. Tests 10/50/100 concurrent users across key endpoints.

## Prerequisites

Install k6:
```bash
# Windows
winget install k6 --source winget

# macOS
brew install k6

# Linux
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

## Usage

```bash
# Ensure the dev server is running first:
pnpm run dev

# Smoke test only (10 VUs, 30s)
k6 run --env TARGET_URL=http://localhost:3001 tests/load/k6-load-test.js

# Authenticated endpoints (get a JWT from /api/auth/login first):
k6 run --env TARGET_URL=http://localhost:3001 --env TEST_TOKEN=<jwt> tests/load/k6-load-test.js

# Quick stress test (100 VUs, 2 min):
k6 run --vus 100 --duration 2m --env TARGET_URL=http://localhost:3001 tests/load/k6-load-test.js
```

## Scenarios

| Scenario | VUs | Duration | Purpose |
|----------|-----|----------|---------|
| smoke    | 10  | 30s      | Baseline — confirms server is healthy |
| load     | 50  | ~4.5min  | Typical concurrent team usage |
| stress   | 100 | ~2min    | Peak load / spike handling |

## Thresholds (fail criteria)

| Metric | Smoke | Load | Stress |
|--------|-------|------|--------|
| Health p95 | <500ms | <1000ms | <2000ms |
| Sessions p95 | <1000ms | <2000ms | <5000ms |
| Error rate | <1% | <1% | <1% |

## Results

Results are saved to `tests/load/results.json` after each run.
