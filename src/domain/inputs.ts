import {
	DEFAULT_CANDLES,
	DEFAULT_OUTPUT_DIR,
	DEFAULT_SEED,
	DEFAULT_START_ISO,
	DEFAULT_TICKS_PER_CANDLE
} from '../contracts/defaults.ts';
import {
	ALLOWED_SYMBOLS,
	getSymbolConfig,
	isAllowedSymbol
} from '../contracts/symbols.ts';
import type {
	GeneratorInputs,
	RawGeneratorInputs
} from '../contracts/types.ts';

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

	const symbolConfig = getSymbolConfig(symbol);

	return {
		candleInterval,
		candleType,
		candles: DEFAULT_CANDLES,
		minTickSize: readOptionalPositiveNumber(
			raw.minTickSize,
			'minTickSize',
			symbolConfig.tickSize
		),
		outputDir: DEFAULT_OUTPUT_DIR,
		seed: DEFAULT_SEED,
		startIso: DEFAULT_START_ISO,
		startPrice: readOptionalPositiveNumber(
			raw.startPrice,
			'startPrice',
			symbolConfig.defaultStartPrice
		),
		symbol,
		ticksPerCandle: DEFAULT_TICKS_PER_CANDLE
	};
}

function readInteger(value: string | number | undefined, name: string) {
	const parsed = Number(value);
	if (!Number.isInteger(parsed)) {
		throw new Error(`${name} must be an integer`);
	}

	return parsed;
}

function readOptionalPositiveNumber(
	value: string | number | undefined,
	name: string,
	defaultValue: number
) {
	if (value === undefined) {
		return defaultValue;
	}

	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`${name} must be a positive number`);
	}

	return parsed;
}
