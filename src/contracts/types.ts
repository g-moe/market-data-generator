import type { Symbol } from './symbols.ts';

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
	scid: string;
	priceLevel: string;
	range10: string;
	tick100: string;
	volume500: string;
	seconds15: string;
	minutes5: string;
	daily: string;
};

export type TimeframeKey = Exclude<keyof OutputFiles, 'metadata' | 'scid'>;

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
		ticks: number;
		priceLevel: number;
		range10: number;
		tick100: number;
		volume500: number;
		seconds15: number;
		minutes5: number;
		daily: number;
	};
};

export type GenerationProgress = {
	completed: number;
	total: number;
	sessionIndex: number;
	ticks: number;
};
