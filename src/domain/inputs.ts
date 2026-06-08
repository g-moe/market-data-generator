import {
	ALLOWED_SYMBOLS,
	DEFAULT_CANDLES,
	DEFAULT_OUTPUT_DIR,
	DEFAULT_SEED,
	DEFAULT_START_ISO,
	DEFAULT_START_PRICE,
	DEFAULT_TICKS_PER_CANDLE,
	getSymbolConfig,
	isAllowedSymbol
} from '../contracts/index.ts';
import type {
	GeneratorInputs,
	RawGeneratorInputs
} from '../contracts/index.ts';

export function normalizeInputs(raw: RawGeneratorInputs): GeneratorInputs {
	const symbol = raw.symbol?.trim().toUpperCase() ?? '';
	if (!isAllowedSymbol(symbol)) {
		throw new Error(`symbol must be one of: ${ALLOWED_SYMBOLS.join(', ')}`);
	}

	const candleType = raw.candleType?.trim().toLowerCase();
	if (candleType !== 'minute' && candleType !== 'daily') {
		throw new Error('candleType must be minute or daily');
	}

	const candleInterval = readInteger(raw.candleInterval, 'candleInterval');
	if (candleInterval < 1) {
		throw new Error('candleInterval must be at least 1');
	}

	return {
		symbol,
		minTickSize: getSymbolConfig(symbol).tickSize,
		candles: DEFAULT_CANDLES,
		candleType,
		candleInterval,
		startIso: DEFAULT_START_ISO,
		startPrice: DEFAULT_START_PRICE,
		seed: DEFAULT_SEED,
		ticksPerCandle: DEFAULT_TICKS_PER_CANDLE,
		outputDir: DEFAULT_OUTPUT_DIR
	};
}

function readInteger(value: string | number | undefined, name: string) {
	const parsed = Number(value);
	if (!Number.isInteger(parsed)) {
		throw new Error(`${name} must be an integer`);
	}

	return parsed;
}
