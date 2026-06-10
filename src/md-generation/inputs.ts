import { join } from 'node:path';

import {
	DEFAULT_ANCHOR_ISO,
	DEFAULT_OUTPUT_ROOT,
	DEFAULT_SEED,
	DEFAULT_SESSION_COUNT,
	DEFAULT_TICKS_PER_SESSION
} from '../contracts/defaults.ts';
import { ALLOWED_SYMBOLS, findSymbol, getSymbolConfig } from '../contracts/symbols.ts';
import { parseIsoToUnixMs, toIsoString } from '../shared/datetime/index.ts';
import type { GeneratorInputs, RawGeneratorInputs } from '../contracts/types.ts';

export function normalizeInputs(raw: RawGeneratorInputs): GeneratorInputs {
	const symbol = findSymbol(raw.symbol ?? '');
	if (symbol === undefined) {
		throw new Error(`symbol must be one of: ${ALLOWED_SYMBOLS.join(', ')}`);
	}

	const symbolConfig = getSymbolConfig(symbol);
	const outputRoot = raw.outputDir?.trim() ?? DEFAULT_OUTPUT_ROOT;
	if (outputRoot === '') {
		throw new Error('outputDir must not be empty');
	}

	return {
		anchorIso: readOptionalIso(raw.anchorIso, DEFAULT_ANCHOR_ISO),
		outputDir: join(outputRoot, symbolConfig.symbolId),
		outputRoot,
		seed: readOptionalInteger(raw.seed, 'seed', DEFAULT_SEED),
		sessionCount: readOptionalInteger(raw.sessionCount, 'sessionCount', DEFAULT_SESSION_COUNT),
		startPrice: readOptionalPositiveNumber(
			raw.startPrice,
			'startPrice',
			symbolConfig.defaultStartPrice
		),
		symbol,
		ticksPerSession: readOptionalInteger(
			raw.ticksPerSession,
			'ticksPerSession',
			DEFAULT_TICKS_PER_SESSION
		)
	};
}

function readOptionalInteger(
	value: string | number | undefined,
	name: string,
	defaultValue: number
) {
	if (value === undefined) return defaultValue;

	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 1) {
		throw new Error(`${name} must be a positive integer`);
	}

	return parsed;
}

function readOptionalPositiveNumber(
	value: string | number | undefined,
	name: string,
	defaultValue: number
) {
	if (value === undefined) return defaultValue;

	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`${name} must be a positive number`);
	}

	return parsed;
}

function readOptionalIso(value: string | undefined, defaultValue: string) {
	const iso = value?.trim() ?? defaultValue;

	try {
		return toIsoString(parseIsoToUnixMs(iso));
	} catch (error) {
		if (error instanceof RangeError) {
			throw new Error('anchorIso must be a valid date');
		}

		throw error;
	}
}
