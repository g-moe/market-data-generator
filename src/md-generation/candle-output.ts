import type {
	PriceLevelTimeframeKey,
	RetainedCandleTimeframeKey,
	StandardCandleTimeframeKey,
	TimeframeKey
} from '../contracts/timeframes.ts';
import type { MdCandle, TimeframeCandle } from '../contracts/types.ts';
import {
	CANDLE_ROW_HEADER,
	CandleRowWriter,
	PRICE_LEVEL_CANDLE_ROW_HEADER,
	toStoredCandleRow,
	toStoredPriceLevelCandleRow
} from '../shared/file-ops/csv.ts';
import { RingBuffer } from './shared/ring-buffer.ts';
import type { TimeRange, TimeframeBuilderSummary } from './pipeline/generation-pipeline.ts';

type StreamingSink<TCandle extends MdCandle> = {
	readonly rowCount: number;
	close: () => Promise<void>;
	open: () => Promise<void>;
	summary: () => TimeframeBuilderSummary;
	write: (candles: TCandle[]) => Promise<void>;
};

type RetainedSink<TCandle extends MdCandle> = {
	finish: () => Promise<void>;
	push: (candles: TCandle[]) => void;
	summary: () => TimeframeBuilderSummary;
};

class StreamingCandleSink<TCandle extends MdCandle> implements StreamingSink<TCandle> {
	private count = 0;
	private first: MdCandle | undefined;
	private last: MdCandle | undefined;

	constructor(
		private readonly key: TimeframeKey,
		private readonly writer: CandleRowWriter<TCandle>
	) {}

	get rowCount() {
		return this.count;
	}

	async open() {
		await this.writer.open();
	}

	async close() {
		await this.writer.close();
	}

	async write(candles: TCandle[]) {
		if (candles.length === 0) return;

		await this.writer.write(candles);
		this.count += candles.length;
		this.first ??= candles[0];
		this.last = candles.at(-1);
	}

	summary(): TimeframeBuilderSummary {
		return {
			count: this.count,
			range: getCandleRange(this.key, this.first, this.last)
		};
	}
}

class RetainedCandleSink<TCandle extends MdCandle> implements RetainedSink<TCandle> {
	private rows: TCandle[] | undefined;
	private readonly ring: RingBuffer<TCandle>;

	constructor(
		private readonly filePath: string,
		private readonly key: RetainedCandleTimeframeKey,
		capacity: number
	) {
		this.ring = new RingBuffer<TCandle>(capacity);
	}

	push(candles: TCandle[]) {
		this.ring.pushMany(candles);
	}

	async finish() {
		this.rows = [...this.ring.iterate()];
		const writer = createStandardCandleWriter(this.filePath);

		await writer.open();

		try {
			await writer.write(this.rows);
		} finally {
			await writer.close();
		}
	}

	summary(): TimeframeBuilderSummary {
		const rows = this.requireRows();
		const first = rows[0];
		const last = rows.at(-1);

		return {
			count: rows.length,
			range: getCandleRange(this.key, first, last)
		};
	}

	private requireRows() {
		if (this.rows === undefined) {
			throw new Error(`Timeframe ${this.key} rows were not materialized`);
		}

		return this.rows;
	}
}

export function createStreamingCandleSink(
	filePath: string,
	key: StandardCandleTimeframeKey
): StandardStreamingCandleSink {
	return new StreamingCandleSink<TimeframeCandle<StandardCandleTimeframeKey>>(
		key,
		createStandardCandleWriter(filePath)
	);
}

export function createStreamingPriceLevelSink(filePath: string): PriceLevelStreamingCandleSink {
	return new StreamingCandleSink<TimeframeCandle<PriceLevelTimeframeKey>>(
		'1s',
		new CandleRowWriter(filePath, PRICE_LEVEL_CANDLE_ROW_HEADER, toStoredPriceLevelCandleRow)
	);
}

export function createRetainedCandleSink(
	filePath: string,
	key: RetainedCandleTimeframeKey,
	capacity: number
): StandardRetainedCandleSink {
	return new RetainedCandleSink<TimeframeCandle<RetainedCandleTimeframeKey>>(
		filePath,
		key,
		capacity
	);
}

function createStandardCandleWriter(filePath: string) {
	return new CandleRowWriter(filePath, CANDLE_ROW_HEADER, toStoredCandleRow);
}

export type StandardStreamingCandleSink = StreamingSink<
	TimeframeCandle<StandardCandleTimeframeKey>
>;
export type PriceLevelStreamingCandleSink = StreamingSink<TimeframeCandle<PriceLevelTimeframeKey>>;
export type StandardRetainedCandleSink = RetainedSink<TimeframeCandle<RetainedCandleTimeframeKey>>;

function getCandleRange(
	key: TimeframeKey,
	first: MdCandle | undefined,
	last: MdCandle | undefined
) {
	if (first === undefined || last === undefined) {
		throw new Error(`Cannot write metadata for empty ${key} candle range`);
	}

	return {
		endTime: last.time,
		startTime: first.time
	} satisfies TimeRange;
}
