# market-data-generator

Generate deterministic market candle data and write it to Sierra Chart SCID.

This is a small TypeScript CLI and library for producing synthetic OHLCV
candles from generated tick data. It supports minute and daily candles,
deterministic output, Sierra Chart `.scid` files, and bid/ask volume totals.

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
2. Candle type, either `minute` or `daily`
3. Candle interval

Example non-interactive run:

```sh
printf "/ES:XCME\nminute\n1\n" | corepack pnpm generate
```

That writes a file like:

```text
data/tradester_ES.scid
```

## Output

Generated `.scid` files use Sierra Chart's intraday binary format: one
56-byte `s_IntradayHeader` followed by 40-byte `s_IntradayRecord` records.
For this milestone, each generated candle is written as one intraday record.
Files are named `tradester_${symbol.symbolId}.scid`.

## Library Usage

```ts
import { generateMarketData } from './src/domain/generate-market-data.ts';
import { normalizeInputs } from './src/domain/inputs.ts';
import { writeCandlesScid } from './src/io/scid.ts';

const result = generateMarketData(
	normalizeInputs({
		symbol: '/ES:XCME',
		candleType: 'minute',
		candleInterval: 1
	})
);

await writeCandlesScid(result.filePath, result.candles);
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
- `generate:without`: generate ES 5-minute candles without prompts.
- `dev`: run the CLI in watch mode.
- `check`: type-check with the configured TypeScript project.
- `test`: run Vitest.
- `build`: compile the package with `tsconfig.build.json`.
