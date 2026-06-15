import type { Symbol } from './symbols.ts';
import type { PriceLevelTimeframeKey, TimeframeKey } from './timeframes.ts';

export type UnixMs = number;
export type Price = number;
export type Volume = number;
export type TradeSide = 'bid' | 'ask';

export type RawGeneratorInputs = {
	symbol?: string;
	outputDir?: string;
	seed?: string | number;
	sessionCount?: string | number;
	anchorIso?: string;
	startPrice?: string | number;
	ticksPerSession?: string | number;
};

export type GeneratorInputs = {
	symbol: Symbol;
	outputRoot: string;
	outputDir: string;
	seed: number;
	sessionCount: number;
	anchorIso: string;
	startPrice: number;
	ticksPerSession: number;
};

export type MarketTick = {
	time: UnixMs;
	price: Price;
	volume: Volume;
	side: TradeSide;
	sessionIndex: number;
};

export type ScidRecord = {
	time: UnixMs;
	open: number;
	high: number;
	low: number;
	close: number;
	transactions: number;
	volume: number;
	bidVolume: number;
	askVolume: number;
};

export type MdCandle = {
	id: bigint;
	close: number;
	high: number;
	low: number;
	open: number;
	pos: number;
	time: UnixMs;
	volume: number;
	bidVolume: number;
	askVolume: number;
	vwap: number;
};

export type MdCandleVolumeByPrice = {
	prices: Map<Price, Volume>;
} & MdCandle;

export type TimeframeCandle<Key extends TimeframeKey = TimeframeKey> = Key extends TimeframeKey
	? Key extends PriceLevelTimeframeKey
		? MdCandleVolumeByPrice
		: MdCandle
	: never;

export type CandleEmissions = {
	[Key in TimeframeKey]: TimeframeCandle<Key>[];
};

export type MdOrder = {
	/** Unique OrderId */
	id: bigint;
	/** Price */
	price: number;
	/** Queue in line (sorted smallest to largest) */
	queueId: bigint;
	/** Side */
	side: 'BUY' | 'SELL' | undefined;
	/** Size of the order */
	size: number;
	/** Time */
	time: UnixMs;
};

export type MdOrderbookLevel = {
	/** Individual orders at this level */
	orders: Map<MdOrder['id'], MdOrder>;
	/** Price */
	price: MdOrder['price'];
	/** Side of market */
	side: 'BUY' | 'SELL';
	/** Total size of all orders at this level */
	totalSize: MdOrder['size'];
};

export type MdOrderbook = Map<MdOrder['price'], MdOrderbookLevel>;

export type StoredMdCandle = {
	id: string;
	close: number;
	high: number;
	low: number;
	open: number;
	pos: number;
	time: UnixMs;
	volume: number;
	bidVolume: number;
	askVolume: number;
	vwap: number;
};

export type StoredMdCandleVolumeByPrice = {
	id: string;
	close: number;
	high: number;
	low: number;
	open: number;
	pos: number;
	time: UnixMs;
	volume: number;
	bidVolume: number;
	askVolume: number;
	vwap: number;
	prices: Array<[Price, Volume]>;
};

export type OutputFiles = {
	metadata: string;
	orderbook: string;
	scids: Record<TimeframeKey, string>;
	timeframes: Record<TimeframeKey, string>;
};

export type OutputMetadata = {
	timeframes: Record<
		TimeframeKey,
		{
			endTime: UnixMs;
			startTime: UnixMs;
		}
	>;
};

export type GenerationResult = {
	inputs: GeneratorInputs;
	files: OutputFiles;
	counts: {
		orderbook: number;
		ticks: number;
		timeframes: Record<TimeframeKey, number>;
	};
};

export type GenerationProgress = {
	completed: number;
	total: number;
	sessionIndex: number;
	ticks: number;
};
