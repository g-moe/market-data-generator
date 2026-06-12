import type { Symbol } from './symbols.ts';

export const TIMEFRAME_KEYS = ['1d', '1s', '5m', '10r', '15s', '100t', '500v'] as const;
export type TimeframeKey = (typeof TIMEFRAME_KEYS)[number];

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
} as const satisfies Record<TimeframeKey, TimeframeDefinition>;

export const CALC_TIMEFRAME_PROMPT = 'tf (same, 1d, 1s, 5m, 10r, 15s, 100t, 500v)';

export const CALC_TIMEFRAME_ERROR =
	'tf must be same or a canonical timeframe like 1d, 1s, 5m, 10r, 15s, 100t, or 500v';

export const CALC_TIMEFRAME_PATTERN = /^(?:same|\d+(?:s|m|d|r|t|v))$/u;

type TimeframeDefinition =
	| {
			type: 'daily';
	  }
	| {
			milliseconds: number;
			type: 'price-level' | 'time';
	  }
	| {
			size: number;
			type: 'range' | 'tick' | 'volume';
	  };

type TimeframeDefinitionByKey = typeof TIMEFRAME_DEFINITIONS;
type TimeframeType = TimeframeDefinitionByKey[TimeframeKey]['type'];
type TimeframeKeyForType<Type extends TimeframeType> = {
	[Key in TimeframeKey]: TimeframeDefinitionByKey[Key]['type'] extends Type ? Key : never;
}[TimeframeKey];
export type DailyTimeframeKey = TimeframeKeyForType<'daily'>;
export type PriceLevelTimeframeKey = TimeframeKeyForType<'price-level'>;
export type TimeTimeframeKey = TimeframeKeyForType<'time'>;
export type RangeTimeframeKey = TimeframeKeyForType<'range'>;
export type TickTimeframeKey = TimeframeKeyForType<'tick'>;
export type VolumeTimeframeKey = TimeframeKeyForType<'volume'>;
export type StandardCandleTimeframeKey =
	| DailyTimeframeKey
	| TimeTimeframeKey
	| RangeTimeframeKey
	| TickTimeframeKey
	| VolumeTimeframeKey;
export type RetainedCandleTimeframeKey =
	| TimeTimeframeKey
	| RangeTimeframeKey
	| TickTimeframeKey
	| VolumeTimeframeKey;

export type ResolvedTimeframe<Key extends TimeframeKey = TimeframeKey> = {
	key: Key;
	suffix: string;
} & TimeframeDefinitionByKey[Key];

export function getTimeframes(symbol: Symbol): ResolvedTimeframe[] {
	return TIMEFRAME_KEYS.map((key) => getTimeframe(symbol, key));
}

export function createTimeframeRecord<Value>(
	createValue: (key: TimeframeKey) => Value
): Record<TimeframeKey, Value> {
	return Object.fromEntries(TIMEFRAME_KEYS.map((key) => [key, createValue(key)])) as Record<
		TimeframeKey,
		Value
	>;
}

export function getTimeframe<Key extends TimeframeKey>(
	symbol: Symbol,
	key: Key
): ResolvedTimeframe<Key> {
	return {
		key,
		...TIMEFRAME_DEFINITIONS[key],
		suffix: getTimeframeSuffix(symbol, key)
	} as ResolvedTimeframe<Key>;
}

export function getTimeframeSuffix(symbol: Symbol, key: TimeframeKey) {
	const definition = TIMEFRAME_DEFINITIONS[key];
	void symbol;

	return getBaseSuffix(definition);
}

function getBaseSuffix(definition: TimeframeDefinition) {
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
