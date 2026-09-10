# CCLX Economic Lab

A local-first, Vercel-compatible product sandbox and quantitative risk laboratory. Version 1.1.0, updated 9 September 2026.

**All balances, token prices, project names, revenues, reserves, market books and trading flows are fictitious. This is a research prototype, not a production financial service, audited smart contract, investment recommendation, or validation of CCLX's actual launch readiness.**

## Run locally

Install Node.js 20 or later on your computer. No npm dependencies, API keys, wallets or exchange accounts are required.

```bash
unzip CCLX_Economic_Lab_v1.1.zip
cd cclx-lab
npm run dev
```

Open the URL printed by the server in your computer's browser. The Windows launcher `DEMARRER_CCLX.cmd` picks a free local port and opens the browser automatically. On Android, localhost means the phone itself, not your computer. For a mobile preview, deploy the static build to a private static host, or use your computer's LAN IP and the same Wi-Fi network. The development server binds to 127.0.0.1 by default. For LAN testing use `HOST=0.0.0.0 npm run dev` only on a trusted network. Do not expose it directly to the public Internet.

Run verification and build:

```bash
npm test
npm run build
```

The production-ready static files are in `dist/`. No npm install is needed. The web application uses native JavaScript ES modules, Web Workers, HTML and CSS. It is not a Next.js application; the dependency-free implementation was chosen to make the prototype executable without a package download. Next.js can be introduced later without replacing the independent economic engine.

### Vercel

Create a new Vercel project from this repository, or upload the `dist/` directory through a supported static deployment workflow. Framework preset: Other. Build command: `npm run build`. Output directory: `dist`. Install command: none. The included `vercel.json` supplies the build and output settings. Do not add live trading credentials to this prototype or publish proprietary inputs in client-side code.

## Application sections

The Overview explains the architecture, limits and launch gates. CLX Lab provides fictitious wallet balances, synthetic CEX/DEX purchases and sales, CO2BIT conversion, project-specific collateral pools, restricted and ordinary deposits/withdrawals, time accrual, reward claims, milestone verification and a transaction ledger. No blockchain transaction is submitted.

Bonding Curve Lab is integrated under Product. It adds a reserve-backed collateral-vault simulator for project-specific curves, participant activity, migrations and protocol fee collection. The lab includes baseline collateral vault reconciliation; linear, normalized power and piecewise/milestone-style curve families; daily event simulation; atomic deposit, withdrawal and migration quotes; separate action frequency, vault turnover and network migration metrics; fee accounts by currency, operation, project, profile, provenance, beneficiary and status; scenario presets; a bounded reproducible optimizer; and exports for config JSON, result JSON, network CSV, transaction CSV, candidate CSV and Markdown report.

Project financing mode is deliberately disabled in this delivery. Modeling it correctly requires deployed capital, cash available, NAV estimates, haircuts, repayment delays, loss/default handling and exit queues. The UI and exports state that gap rather than simulating fictitious backing.

Launch liquidity tests quote capital, market-maker inventory, finite CEX bids and asks, constant-product DEX reserves, 0.25–10% depth, execution slippage, buy/sell order size, price-depth surfaces, and proportional funding requirements. Funding & unlocks shows the five working sale rounds, FDVs, vesting, separate restricted capacity, monthly seller pressure and funding gaps. Financial Simulation runs seeded monthly stochastic prices, jumps, correlated project performance/defaults, revenue waterfalls, capped emissions, free versus restricted staking, finite arbitrage and cash-limited market-maker replenishment. It displays tail outcomes, drawdowns, executed sales, queues, reserve depletion, and monthly unlock pain zones. Exploit laboratory checks model-level invariants. Market calibration accepts a CSV order-book snapshot. Assumptions & gates supports editable JSON, validation and export.

The interface uses native SVG charts, not low-resolution generated pictures. Desktop and mobile CSS layouts are provided; real Android rendering remains to be checked on a deployed preview.

## Core economic conventions

- Maximum supply: 200M CCLX, fixed. The 26M reward allocation is a capped release budget over eight years, not ongoing inflation above the cap.
- Funding table: 44M tokens, 22% of supply, $7.68M proposed gross proceeds. It is a token-sale table, **not a corporate equity cap table**.
- Team & Founders: 36M/18% in the current working allocation, with a 12M internal capacity earmarked for restricted legacy conversion. The legacy capacity is disclosed in the model; material token allocations should not be concealed from investors.
- CO2BIT legacy holders receive restricted collateral-only balances, subject to eligibility, snapshot, caps, conversion ratio and vesting. Ordinary vesting does not turn these balances into freely tradable tokens. Restricted receipts, rewards, withdrawals, transfers and borrowing cannot launder that provenance. The model does not implement actual token contracts.
- Green Bond contractual principal/interest and reporting rights are separate from CCLX pool rewards. Carbon Forward environmental deliveries are separate contractual rights. CCLX itself does not automatically confer project ownership, bondholder rights or carbon credits.
- Real yield is allocated from realized distributable project/protocol cash flows after modelled costs and losses. Bootstrap rewards are separately denominated CCLX emissions. APRs are variable, project-specific, and not promised returns.
- Project curves are reserve-backed integral pricing models with separate receipt accounting. They do not guarantee capital protection, liquidity, NAV appreciation or a price floor. Milestones do not automatically pump prices. Changing a curve family or scale requires funded reserve reconciliation; the simulation never creates backing from a parameter change.
- CEX cash, DEX reserves, token inventory, project collateral, risk reserve and liquidity replenishment reserve are separate resources. A token's mark-to-market value is not additional available cash. A replenishment request that exceeds cash is recorded as unfunded rather than silently creating liquidity.
- Stochastic price paths are synthetic GBM plus jumps, with simplified flow/impact feedback and correlated project shocks. They are monthly, not tick-level order-book simulations. Probabilities are conditional on the assumptions and must not be read as empirical forecasts. Imported order books are snapshots, not evidence of durable executable liquidity.

## Tests and reports

`npm test` runs 32 tests: the original 24 tests plus curve-lab acceptance coverage for provenance, conservation, exact migration fees, zero-activity fees, power-curve inversion, fixed-total-resource network growth, optimizer feasibility and Node VM interface integration. The interface test requires Node's experimental VM modules flag (included in the npm script). It does not substitute for a real browser test. `scripts/browser-smoke.py` is an optional Playwright browser test requiring Python Playwright and Chromium.

`npm run build` copies the static application to `dist/`. `node scripts/generate-report.mjs` reproduces the two 100-path/36-month sample runs, launch audit, attacks, unlock tables and results. The full seeded report is `reports/reproducible-simulation.json`; `reports/RESULTS.md` summarizes it. Curve-lab example inputs are in `examples/curve-network-growth.json`, `examples/curve-optimization-search.json` and `examples/project-cohorts.csv`; result exports can generate network, transaction and candidate CSVs from the same data displayed in the UI. Re-running with unchanged code and assumptions yields identical numerical results. The default launch audit is a synthetic structural check only; the actual launch-readiness register remains not ready/unverified.

## Validation needed before production

Obtain verified token allocation and vesting agreements; audited restricted-token and receipt contracts; a legal opinion covering all instruments, rewards, custody and redemption rights; executable market-maker quotes and funded commitments; observed order-book snapshots and historical trading flow calibration; independent project financials and revenue evidence; verified cash reserves, legal ring-fencing and waterfall obligations; independently reviewed default/correlation assumptions; and adverse-selection, MEV, oracle, liquidation and market-manipulation security assessments. No parameter or output in this prototype should be presented as an independently verified CCLX fact.

The report is a research tool for discussing requirements and comparing scenarios, not a replacement for financial, legal or security due diligence. CCLX/CO2BIT names are used for this mock engagement; fictional projects have no connection to real project performance.


## Single-file Android / offline build

`standalone.html` contains the entire application, bundled engine, styles and simulation worker. It requires a recent browser supporting DecompressionStream and ES modules, but no Node.js installation or network requests. Download the HTML and open it in Chrome using a file manager. If Chrome refuses local HTML files, use a static HTTPS host or run the included Node server on a computer. Browser file-origin and Android-specific behavior has not been validated in this environment.

This standalone build is generated by `python3 scripts/build-standalone.py`. It is a research application, not audited contracts or a live trading platform. A Vercel connectivity-check deployment was created, but the full application has not been published and no live application URL is claimed.
