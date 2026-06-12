import type { DailyTimeframeKey } from '../../contracts/timeframes.ts';
import type { MdCandle, Price, TradeSide, UnixMs, Volume } from '../../contracts/types.ts';
import { createBarId } from '../shared/candles.ts';
import type {
	GeneratedTick,
	GenerationSession,
	GenerationBuilder,
	TimeRange
} from '../pipeline/generation-pipeline.ts';
import type { StandardStreamingCandleSink } from '../candle-output.ts';
import { UNIX_EPOCH_MS } from '../shared/market-time-constants.ts';

type MutableDailySession = {
	askVolume: number;
	bidVolume: number;
	close: Price;
	high: Price;
	low: Price;
	open: Price;
	priceVolume: number;
	volume: Volume;
};

export class DailyBuilder implements GenerationBuilder {
	private readonly key: DailyTimeframeKey = '1d';
	private current: MutableDailySession | undefined;
	private firstGeneratedSessionStart: UnixMs | undefined;
	private lastGeneratedSessionStart: UnixMs | undefined;

	constructor(private readonly sink: StandardStreamingCandleSink) {}

	async open() {
		await this.sink.open();
	}

	startSession(session: GenerationSession) {
		this.current = undefined;

		if (!session.generated) return;

		this.current = createMutableDailySession();
		this.firstGeneratedSessionStart ??= session.start;
		this.lastGeneratedSessionStart = session.start;
	}

	isTickActive() {
		return this.current !== undefined;
	}

	step(tick: GeneratedTick) {
		if (this.current === undefined) return;

		this.stepValues(tick.session, tick.index, tick.time, tick.price, tick.volume, tick.side);
	}

	stepValues(
		_session: GenerationSession,
		index: number,
		_time: UnixMs,
		price: Price,
		volume: Volume,
		side: TradeSide
	) {
		this.pushTickValues(index, price, volume, side);
	}

	pushTickValues(index: number, price: Price, volume: Volume, side: TradeSide) {
		if (this.current === undefined) return;

		addTickToDailySession(this.current, price, volume, side, index);
	}

	async finalizeSession(session: GenerationSession) {
		if (session.generated) {
			if (this.current === undefined) {
				throw new Error('Daily session has no active aggregation');
			}

			await this.sink.write([
				finalizeDailySession(this.current, this.sink.rowCount, session.start)
			]);
			this.current = undefined;

			return;
		}

		await this.sink.write([createZeroDailyCandle(this.sink.rowCount)]);
	}

	finish() {}

	async close() {
		await this.sink.close();
	}

	summary() {
		if (
			this.firstGeneratedSessionStart === undefined ||
			this.lastGeneratedSessionStart === undefined
		) {
			throw new Error('Cannot write metadata without a non-zero session');
		}

		return {
			timeframes: {
				[this.key]: {
					count: this.sink.summary().count,
					range: {
						endTime: this.lastGeneratedSessionStart,
						startTime: this.firstGeneratedSessionStart
					} satisfies TimeRange
				}
			}
		};
	}
}

function createMutableDailySession(): MutableDailySession {
	return {
		askVolume: 0,
		bidVolume: 0,
		close: 0,
		high: 0,
		low: 0,
		open: 0,
		priceVolume: 0,
		volume: 0
	};
}

function addTickToDailySession(
	dailySession: MutableDailySession,
	price: Price,
	volume: Volume,
	side: TradeSide,
	index: number
) {
	if (index === 0) {
		dailySession.open = price;
		dailySession.high = price;
		dailySession.low = price;
	} else {
		dailySession.high = Math.max(dailySession.high, price);
		dailySession.low = Math.min(dailySession.low, price);
	}

	dailySession.close = price;
	dailySession.volume += volume;
	dailySession.bidVolume += side === 'bid' ? volume : 0;
	dailySession.askVolume += side === 'ask' ? volume : 0;
	dailySession.priceVolume += price * volume;
}

function finalizeDailySession(
	dailySession: MutableDailySession,
	pos: number,
	sessionStart: UnixMs
): MdCandle {
	return {
		askVolume: dailySession.askVolume,
		bidVolume: dailySession.bidVolume,
		close: dailySession.close,
		high: dailySession.high,
		id: createBarId(sessionStart, 0),
		low: dailySession.low,
		open: dailySession.open,
		pos,
		time: sessionStart,
		volume: dailySession.volume,
		vwap: dailySession.priceVolume / dailySession.volume
	};
}

function createZeroDailyCandle(sequence: number): MdCandle {
	return {
		askVolume: 0,
		bidVolume: 0,
		close: 0,
		high: 0,
		id: createBarId(UNIX_EPOCH_MS, sequence),
		low: 0,
		open: 0,
		pos: sequence,
		time: UNIX_EPOCH_MS,
		volume: 0,
		vwap: 0
	};
}
