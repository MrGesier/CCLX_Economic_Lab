# CCLX Economic Lab — reproducible synthetic report

Model version: 1.1.0. 100 seeded paths, 36 monthly steps, seed 20260907. No market or project figures have been independently verified.

## Launch assumptions

Quote funding: $1 500 000; CEX $900 000, DEX $600 000. MM inventory 8 000 000 CCLX is not additional cash. 2% bid depth: $606030. Static launch audit: PASS. Minimum proportional liquidity sizing: $1485074.

## Monte Carlo

Base median terminal price: $0.0719; 5–95%: $0.0043–$0.5966. Probability of at least one depth-coverage breach: 98.0%. Probability of attempted unfunded liquidity replenishment: 100.0%. Combined-crisis median terminal price: $0.0038.

These are model-conditional outputs, not price forecasts. An unfunded-replenishment event means the modeled market maker attempted to restore cash that was not available; it does not imply a contractual obligation to defend token price.

## Adversarial checks

15 model checks passed, 0 failed, 4 require external verification. Contract security, legal rights, genuine market-maker commitments and project cash flows have not been validated. Launch readiness: NOT VERIFIED / NOT READY.

## Important modeling boundaries

The current CEX order book is an aggregated synthetic ladder, not a live exchange. The DEX is constant-product; project curves are reserve-backed linear integrals with separate receipt accounting. Monthly flows are approximations and do not constitute a tick-level limit-order-book or agent-based simulation. Price, order flow and project risks must be calibrated before interpreting probabilities. Restricted CO2BIT principal and rewards remain non-transferable; they do not become ordinary circulating supply through vesting. The ordinary team allocation is distinct from the restricted internal capacity. Token funding is not an equity cap table.

See the JSON files for all numerical assumptions and outputs; CSV files provide the unlock and pain-zone series.
