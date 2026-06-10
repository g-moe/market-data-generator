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
pnpm generate
```

The CLI prompts for:

1. Symbol

Example non-interactive run:

```sh
printf "ES\n" | pnpm generate
```

## File Outputs

```text
data/ES/tradester_ES.scid           raw ticks for 20,000 sessions
data/ES/tradester_ES_1d.csv         20,000 daily bars
data/ES/tradester_ES_5m.csv         latest 20,000 5-minute bars
data/ES/tradester_ES_15s.csv        latest 20,000 15-second bars
data/ES/tradester_ES_500v.csv       latest 20,000 500-volume bars
data/ES/tradester_ES_1s_pl0.25.csv  30 sessions of 1-second price-level bars
```

## Calculation Note

All bars are calculated directly from generated raw ticks; `1d` uses session
boundaries, time bars use their time buckets, `500v` splits ticks as needed,
and `1s` price-level bars also store volume by price.

Raw ticks are the source of truth. The `.scid` file is for Sierra Chart.
Derived candle files are fixed-schema CSV-style rows with one header line.
`bigint` IDs are stored as strings. Price-level rows add a `prices` field
encoded as `price:volume;price:volume`.

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

- `generate`: run the interactive generator once.
- `generate:without`: generate ES data without prompts.
- `dev`: run the CLI in watch mode.
- `check`: run `typecheck`, `lint`, `format`, and `knip`.
- `coverage`: run unit tests with coverage (`vitest`).
- `test:e2e:sierra`: run Sierra e2e flow checks.
- `test:e2e:md-generation`: run md-generation e2e checks.
- `build`: compile the package with `tsconfig.build.json`.

### CI setup

CI should not run `pnpm run setup`.

Use explicit CI steps instead:

1. `actions/setup-node` with `node-version-file: .nvmrc`
2. `corepack prepare "$(node -p "require('./package.json').packageManager")" --activate`
3. `pnpm install --frozen-lockfile`
4. run checks via normal `pnpm` scripts
