# market-data-generator

Generate deterministic synthetic market data from raw ticks.

This is a small TypeScript CLI and library for producing deterministic raw
trade ticks, writing Sierra Chart `.scid` tick data, and deriving candle row
files from those same ticks.

## Requirements

- Node.js 24.16.0
- pnpm 11.5.2

Use these files as the version sources of truth:

- `.nvmrc` pins Node.js.
- `package.json#packageManager` pins pnpm.

Use the one-time setup command before first run:

```sh
pnpm run setup
```

`pnpm run setup` handles:

- switching to the required Node version via `nvm`
- activating the pinned pnpm version with `corepack`
- installing dependencies once with `pnpm install`

It is intentionally not intended for CI.

## Run the CLI

```sh
pnpm run run-md-generate ES
```

To run the generator, you must pass a symbol argument:

Supported symbols:

```text
ES (/ES:XCME): E-mini S&P 500
NQ (/NQ:XCME): E-mini NASDAQ-100
```

`run-sierra-generate` also requires a symbol argument:

```sh
pnpm run run-sierra-generate ES
```

To list supported symbols:

```sh
pnpm run run:options
```

## Calculation Note

All bars are calculated directly from generated raw ticks; `1d` uses session
boundaries, `1s` bars store volume by price, time bars use their time buckets,
`10r` groups by range, `100t` groups whole ticks by trade count, and `500v`
splits ticks as needed.

Raw ticks are the source of truth. The `.scid` files are for Sierra Chart.
Each timeframe writes its own `.scid` file. `1d` keeps the full generated raw
tick history. Non-daily `.scid` files are written from each timeframe's
retained-bar start so Sierra does not calculate indicators from hidden
pre-retention tick history.
Derived candle files are fixed-schema CSV-style rows with one header line.
`bigint` IDs are stored as strings. Price-level rows add a `prices` field
encoded as `price:volume;price:volume`. The orderbook depth file uses Sierra
Chart's binary `.depth` format, with an initial full book snapshot and
per-generated-tick market depth update batches.

The generator uses the ES/NQ futures session model: Sunday 17:00 CT through
Friday 16:00 CT with the daily 16:00-17:00 CT maintenance break.

Requested daily history that would fall before Unix epoch is padded with zero
daily bars at `time: 0`; ticks and `.scid` records are generated only for
non-negative Unix timestamps.

## Library Usage

```ts
import { generateMarketData } from './src/domain/generate-market-data.ts';
import { normalizeInputs } from './src/domain/inputs.ts';

const result = await generateMarketData(
	normalizeInputs({
		symbol: 'ES'
	})
);

console.log(result.files);
```

## Development

```sh
pnpm run check
pnpm lint
pnpm format
pnpm coverage
pnpm build
```

Useful scripts:

- `run-md-generate`: generate market-data once for the requested symbol.
- `run-sierra-generate`: sync Sierra inputs for the requested symbol.
- `run:options`: print all supported symbols.
- `dev`: run the CLI in watch mode.
- `check`: runs `lint`, `format`, and `knip`.
- `lint`: run type-aware linting and type checking in one pass via `oxlint --type-aware --type-check`.
- `coverage`: run unit tests with coverage (`vitest`).
- `test:e2e:sierra`: run Sierra e2e flow checks.
- `test:e2e:md-generation`: run md-generation e2e checks.
- `build`: compile the package with `tsconfig.build.json`.

### CI setup

CI should not run `pnpm run setup`.

Use explicit CI steps instead:

1. `actions/setup-node` with `node-version-file: .nvmrc`
2. `bash ./scripts/setup/.setup-ci.sh`
3. run checks via normal `pnpm` scripts
