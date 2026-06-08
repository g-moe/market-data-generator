export { buildCandles } from './domain/candles.ts';
export { generateMarketData } from './domain/generate-market-data.ts';
export { normalizeInputs } from './domain/inputs.ts';
export {
	ALLOWED_SYMBOLS,
	DEFAULT_CANDLES,
	DEFAULT_OUTPUT_DIR,
	DEFAULT_SEED,
	DEFAULT_START_ISO,
	DEFAULT_TICKS_PER_CANDLE,
	getSymbolConfig,
	isAllowedSymbol,
	SYMBOL_CONFIG,
	SYMBOL_OPTIONS
} from './contracts/index.ts';
export { CENTRAL_TIMEZONE } from './contracts/index.ts';
export { buildTicks } from './domain/ticks.ts';
export type {
	Candle,
	CandleType,
	GenerationResult,
	GeneratorInputs,
	RawGeneratorInputs,
	Tick
} from './contracts/index.ts';
export type { Symbol, SymbolConfig } from './contracts/index.ts';
export { serializeCandlesToCsv, writeCandlesCsv } from './io/csv.ts';
