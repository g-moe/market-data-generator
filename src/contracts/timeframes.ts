import type { Symbol } from './symbols.ts';
import { getSymbolConfig } from './symbols.ts';

export const TIMEFRAME_DEFINITIONS = {
	'100t': {
		size: 100,
		type: 'tick'
	},
	'10r': {
		size: 10,
		type: 'range'
	},
	'15s': {
		milliseconds: 15_000,
		type: 'time'
	},
	'1d': {
		type: 'daily'
	},
	'1s': {
		milliseconds: 1_000,
		type: 'price-level'
	},
	'500v': {
		size: 500,
		type: 'volume'
	},
	'5m': {
		milliseconds: 300_000,
		type: 'time'
	}
} as const;

type TimeframeKey = keyof typeof TIMEFRAME_DEFINITIONS;

export function getTimeframes(symbol: Symbol) {
	const config = getSymbolConfig(symbol);

	return [
		withKey('1d'),
		withKey('5m'),
		withKey('15s'),
		withKey('100t'),
		withKey('10r'),
		withKey('500v'),
		withOneSecondPriceLevelSuffix(config.tickSize)
	] as const;
}

function withKey<Key extends Exclude<TimeframeKey, '1s'>>(key: Key) {
	return {
		key,
		...TIMEFRAME_DEFINITIONS[key],
		suffix: getSuffix(TIMEFRAME_DEFINITIONS[key])
	};
}

function withOneSecondPriceLevelSuffix(tickSize: number) {
	return {
		key: '1s' as const,
		...TIMEFRAME_DEFINITIONS['1s'],
		suffix: `${getSuffix(TIMEFRAME_DEFINITIONS['1s'])}_pl${tickSize}`
	};
}

function getSuffix(definition: (typeof TIMEFRAME_DEFINITIONS)[TimeframeKey]) {
	switch (definition.type) {
		case 'daily':
			return '1d';
		case 'price-level':
		case 'time':
			return getTimeSuffix(definition.milliseconds);
		case 'range':
			return `${definition.size}r`;
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
