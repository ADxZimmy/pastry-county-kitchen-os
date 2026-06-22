# Performance Certification Gate

Standard: Core Web Vitals production-readiness evidence.

## Automated Checks

- Production app shell loads without request failures or console errors.
- Key routes become idle within the configured route timing budget.
- API health responds inside the configured latency budget.
- Primary route-transition interaction stays below the lab threshold.
- Built bundle sizes are recorded from `dist`.
- Route resource count and transfer sizes are recorded.
- No unexpected layout overflow or modal-induced layout shifts are observed in the smoke pass.

## Target Thresholds

- LCP: <= 2.5s for a good lab/mobile run.
- INP: <= 200ms when real-user or Lighthouse INP evidence is available.
- Route-transition lab interaction: <= 500ms for certification runner navigation probes.
- CLS: <= 0.1 where browser-reported layout shift data is available.
- API health: <= 1000ms p95 in this certification run.
- Key route navigation: <= 3000ms in this certification run.

## Manual Sign-Off

- Confirm expected concurrent usage for the bakery operation.
- Run a load/concurrency test if the app will support multiple active teams or branches.
- Confirm database indexes for high-growth tables: audit logs, inventory movements, ingredient batches, orders, and order items.

## Blocking Criteria

Repeated route load failures, request failures, console errors, p95 API timing above the agreed budget, or Core Web Vitals below good thresholds block 100/100.
