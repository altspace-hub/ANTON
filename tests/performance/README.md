# Anton — Performance Tests

Load testing scripts using [k6](https://k6.io).

## Install k6

**Windows:** `winget install k6 --source winget`
**macOS:** `brew install k6`
**Docker:** `docker pull grafana/k6`

## Run tests

```bash
# Quick smoke test (1 user, 30 seconds)
k6 run tests/performance/smoke.js

# Load test (50 users, 5 minutes)
k6 run tests/performance/load.js

# Stress test (ramp to 200 users)
k6 run tests/performance/stress.js

# Soak test (20 users for 30 minutes)
k6 run tests/performance/soak.js
```

## Environment variables
```bash
k6 run -e BASE_URL=http://localhost:3001 -e USERNAME=admin -e PASSWORD=secret tests/performance/load.js
```

## Results
k6 outputs: response times (p50/p90/p95/p99), error rate, throughput (req/s), and checks pass rate.
Target SLOs: p95 < 2000ms for API calls, < 500ms for static assets, error rate < 1%.
