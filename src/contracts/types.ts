import type { Symbol } from './symbols.ts';

export type CandleType = 'minute' | 'daily';

export type RawGeneratorInputs = {
	symbol?: string;
	minTickSize?: string | number;
	candles?: string | number;
	candleType?: string;
	candleInterval?: string | number;
	startIso?: string;
	startPrice?: string | number;
	seed?: string | number;
	ticksPerCandle?: string | number;
	outputDir?: string;
};

export type GeneratorInputs = {
	symbol: Symbol;
	minTickSize: number;
	candles: number;
	candleType: CandleType;
	candleInterval: number;
	startIso: string;
	startPrice: number;
	seed: number;
	ticksPerCandle: number;
	outputDir: string;
};

export type Tick = {
	time: Date;
	price: number;
	volume: number;
	side: 'bid' | 'ask';
	candleIndex: number;
};

export type Candle = {
	time: Date;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
	transactions: number;
	bidVolume: number;
	askVolume: number;
	isNewTradingDay: boolean;
};

export type GenerationResult = {
	inputs: GeneratorInputs;
	ticks: Tick[];
	candles: Candle[];
	filePath: string;
};
