# market-data-generator

Generate deterministic market candle data and write it to CSV.

This is a small TypeScript CLI and library for producing synthetic OHLCV
candles from generated tick data. It supports minute and daily candles,
deterministic output, Central Time CSV timestamps, and bid/ask volume totals.

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
corepack pnpm cli
```

The CLI prompts for:

1. Symbol
2. Candle type, either `minute` or `daily`
3. Candle interval

Example non-interactive run:

```sh
printf "/ES:XCME\nminute\n1\n" | corepack pnpm cli
```

That writes a file like:

```text
data/es_1minute.csv
```

## CSV Output

Generated CSV files use this header:

```text
Date,Time,Open,High,Low,Close,Volume,Bid Volume,Ask Volume
```

Dates and times are formatted in `America/Chicago`.

## Library Usage

```ts
import {
	generateMarketData,
	normalizeInputs,
	writeCandlesCsv
} from './src/index.ts';

const result = generateMarketData(
	normalizeInputs({
		symbol: '/ES:XCME',
		candleType: 'minute',
		candleInterval: 1
	})
);

await writeCandlesCsv(result.filePath, result.candles);
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

- `cli`: run the generator once.
- `dev`: run the CLI in watch mode.
- `check`: type-check with the configured TypeScript project.
- `test`: run Vitest.
- `build`: compile the package with `tsconfig.build.json`.
