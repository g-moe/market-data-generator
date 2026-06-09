# market-data-generator

Generate deterministic synthetic market data from raw ticks.

This is a small TypeScript CLI and library for producing deterministic raw
trade ticks, writing Sierra Chart `.scid` tick data, and deriving JavaScript
candle files from those same ticks.

## Requirements

- Node.js 24.16.0
- pnpm 11.5.2

Use Corepack so the pinned pnpm version is used:

```sh
corepack enable
corepack pnpm install
```

## Run the CLI

```sh
corepack pnpm generate
```

The CLI prompts for:

1. Symbol

Example non-interactive run:

```sh
printf "ES\n" | corepack pnpm generate
```

## File Outputs

```text
data/ES/tradester_ES.scid           raw ticks for 20,000 sessions
data/ES/tradester_ES_1d.json        20,000 daily bars
data/ES/tradester_ES_5m.json        latest 20,000 5-minute bars
data/ES/tradester_ES_15s.json       latest 20,000 15-second bars
data/ES/tradester_ES_500v.json      latest 20,000 500-volume bars
data/ES/tradester_ES_1s_pl0.25.json 30 sessions of 1-second price-level bars
```

## Calculation Note

All bars are calculated directly from generated raw ticks; `1d` uses session
boundaries, time bars use their time buckets, `500v` splits ticks as needed,
and `1s` price-level bars also store volume by price.

Raw ticks are the source of truth. The `.scid` file is for Sierra Chart.
Derived candle files are JSON; `bigint` IDs are stored as strings and `Map`
price levels are stored as entry arrays.

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
corepack pnpm check
corepack pnpm lint
corepack pnpm format:check
corepack pnpm test
corepack pnpm coverage
corepack pnpm build
```

Useful scripts:

- `generate`: run the interactive generator once.
- `generate:without`: generate ES data without prompts.
- `dev`: run the CLI in watch mode.
- `check`: type-check with the configured TypeScript project.
- `test`: run Vitest.
- `build`: compile the package with `tsconfig.build.json`.
