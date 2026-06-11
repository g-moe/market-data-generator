import type { Symbol } from './symbols.ts';
import { getSymbolConfig } from './symbols.ts';

export const TIMEFRAME_DEFINITIONS = {
	daily: {
		type: 'daily'
	},
	minutes5: {
		milliseconds: 300_000,
		type: 'time'
	},
	priceLevel: {
		milliseconds: 1_000,
		type: 'price-level'
	},
	seconds15: {
		milliseconds: 15_000,
		type: 'time'
	},
	tick100: {
		size: 100,
		type: 'tick'
	},
	volume500: {
		size: 500,
		type: 'volume'
	}
} as const;

type TimeframeKey = keyof typeof TIMEFRAME_DEFINITIONS;

export function getTimeframes(symbol: Symbol) {
	const config = getSymbolConfig(symbol);

	return [
		withKey('daily'),
		withKey('minutes5'),
		withKey('seconds15'),
		withKey('tick100'),
		withKey('volume500'),
		withPriceLevelSuffix(config.tickSize)
	] as const;
}

function withKey<Key extends Exclude<TimeframeKey, 'priceLevel'>>(key: Key) {
	return {
		key,
		...TIMEFRAME_DEFINITIONS[key],
		suffix: getSuffix(TIMEFRAME_DEFINITIONS[key])
	};
}

function withPriceLevelSuffix(tickSize: number) {
	return {
		key: 'priceLevel' as const,
		...TIMEFRAME_DEFINITIONS.priceLevel,
		suffix: `${getSuffix(TIMEFRAME_DEFINITIONS.priceLevel)}_pl${tickSize}`
	};
}

function getSuffix(definition: (typeof TIMEFRAME_DEFINITIONS)[TimeframeKey]) {
	switch (definition.type) {
		case 'daily':
			return '1d';
		case 'price-level':
		case 'time':
			return getTimeSuffix(definition.milliseconds);
		case 'tick':
			return `${definition.size}t`;
		case 'volume':
			return `${definition.size}v`;
	}
}

function getTimeSuffix(milliseconds: number) {
	const seconds = milliseconds / 1000;
	if (seconds % 60 === 0) return `${(seconds / 60).toString()}m`;

	return `${seconds.toString()}s`;
}
