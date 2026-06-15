import { describe, expect, it, vi } from 'vitest';

import type { MdCandle } from '../../../contracts/types.ts';
import { DailyBuilder } from '../../../md-generation/builders/daily-builder.ts';
import { DepthBuilder } from '../../../md-generation/builders/depth-builder.ts';
import { PriceLevelBuilder } from '../../../md-generation/builders/price-level-builder.ts';
import { ScidBuilder } from '../../../md-generation/builders/scid-builder.ts';
import { TickBuilder } from '../../../md-generation/builders/tick-builder.ts';
import { TimeBuilder } from '../../../md-generation/builders/time-builder.ts';
import { VolumeBuilder } from '../../../md-generation/builders/volume-builder.ts';
import type {
	GeneratedTick,
	GenerationSession
} from '../../../md-generation/pipeline/generation-pipeline.ts';
import type {
	PriceLevelRetainedCandleSink,
	StandardRetainedCandleSink,
	StandardStreamingCandleSink
} from '../../../md-generation/candle-output.ts';
import type { MarketDepthSessionWriter } from '../../../shared/file-ops/depth.ts';
import { SCID_EPOCH_OFFSET_MS, type ScidTickWriter } from '../../../shared/file-ops/scid.ts';

describe('builder lifecycle wrappers', () => {
	it('aggregates generated daily sessions and pads non-generated sessions', async () => {
		const sink = createStreamingSink();
		const builder = new DailyBuilder(sink);
		const generated = session({ generated: true, start: 1000 });
		const padded = session({ generated: false, index: 1, start: -1 });

		expect(builder.isTickActive()).toBe(false);
		builder.step(tick({ session: padded }));
		builder.pushTickValues(0, 6000, 1, 'ask');

		builder.startSession(generated);
		expect(builder.isTickActive()).toBe(true);
		builder.step(tick({ index: 0, price: 6000, session: generated, side: 'ask', volume: 2 }));
		builder.pushTickValues(1, 6002, 3, 'bid');
		await builder.finalizeSession(generated);

		builder.startSession(padded);
		expect(builder.isTickActive()).toBe(false);
		await builder.finalizeSession(padded);

		expect(sink.writes).toHaveLength(2);
		expect(sink.writes[0]).toMatchObject([
			{
				askVolume: 2,
				bidVolume: 3,
				close: 6002,
				high: 6002,
				low: 6000,
				open: 6000,
				time: 1000,
				volume: 5,
				vwap: 6001.2
			}
		]);
		expect(sink.writes[1]).toMatchObject([
			{
				close: 0,
				open: 0,
				time: 0,
				volume: 0,
				vwap: 0
			}
		]);
		expect(builder.summary().timeframes['1d']?.range).toEqual({
			endTime: 1000,
			startTime: 1000
		});
	});

	it('throws when finalizing or summarizing daily output without generated ticks', async () => {
		const builder = new DailyBuilder(createStreamingSink());
		const generated = session({ generated: true });

		await expect(builder.finalizeSession(generated)).rejects.toThrow(
			'Daily session has no active aggregation'
		);
		expect(() => builder.summary()).toThrow('Cannot write metadata without a non-zero session');
	});

	it('writes SCID values with precomputed Sierra time and side volumes', () => {
		const writer = {
			close: vi.fn<() => Promise<void>>(),
			open: vi.fn<() => Promise<void>>(),
			pushScDateTimeMsVolumeValues:
				vi.fn<
					(
						scDateTimeMs: number,
						price: number,
						volume: number,
						bidVolume: number,
						askVolume: number
					) => void
				>()
		};
		const builder = new ScidBuilder(writer as unknown as ScidTickWriter);
		const generated = session({ generated: true });

		builder.step(tick({ price: 6000, session: generated, side: 'ask', volume: 4 }));
		builder.pushTickValues(86_400_000, 6001, 5, 'bid');

		expect(writer.pushScDateTimeMsVolumeValues).toHaveBeenNthCalledWith(
			1,
			(0 - SCID_EPOCH_OFFSET_MS) * 1000,
			6000,
			4,
			0,
			4
		);
		expect(writer.pushScDateTimeMsVolumeValues).toHaveBeenNthCalledWith(
			2,
			(86_400_000 - SCID_EPOCH_OFFSET_MS) * 1000,
			6001,
			5,
			5,
			0
		);
	});

	it('activates depth output only for retained generated sessions', async () => {
		const writer = {
			close: vi.fn<() => Promise<void>>(),
			open: vi.fn<() => Promise<void>>(),
			pushRecordValues: vi.fn<
				(
					time: number,
					command: number,
					flags: number,
					numOrders: number,
					price: number,
					quantity: number
				) => void
			>(() => {
				writer.recordCount++;
			}),
			recordCount: 0,
			startSession: vi.fn<(sessionStart: number) => Promise<void>>()
		};
		const builder = new DepthBuilder(writer as unknown as MarketDepthSessionWriter, 0.25, 2, 10);
		const skipped = session({ generated: true, index: 7 });
		const retained = session({ generated: true, index: 8, start: 2000 });

		await builder.startSession(skipped);
		expect(builder.isTickActive()).toBe(false);
		builder.step(tick({ session: skipped }));
		expect(writer.startSession).not.toHaveBeenCalled();
		expect(writer.pushRecordValues).not.toHaveBeenCalled();

		await builder.startSession(retained);
		expect(builder.isTickActive()).toBe(true);
		builder.step(tick({ price: 6000, session: retained, side: 'bid', time: 2001, volume: 2 }));

		expect(writer.startSession).toHaveBeenCalledWith(2000);
		expect(writer.pushRecordValues).toHaveBeenCalled();
		expect(builder.summary()).toEqual({ orderbook: writer.recordCount });
	});

	it('flushes tick and volume retained builders at session boundaries', async () => {
		const tickSink = createRetainedSink();
		const volumeSink = createRetainedSink();
		const tickBuilder = new TickBuilder(tickSink);
		const volumeBuilder = new VolumeBuilder(volumeSink);
		const generated = session({ generated: true });
		const skipped = session({ generated: false, index: 1 });

		tickBuilder.startSession(skipped);
		volumeBuilder.startSession(skipped);
		tickBuilder.step(tick({ session: skipped }));
		volumeBuilder.step(tick({ session: skipped }));
		tickBuilder.finalizeSession(skipped);
		volumeBuilder.finalizeSession(skipped);

		tickBuilder.startSession(generated);
		volumeBuilder.startSession(generated);
		tickBuilder.step(tick({ price: 6000, session: generated, volume: 2 }));
		volumeBuilder.step(tick({ price: 6000, session: generated, volume: 600 }));
		tickBuilder.finalizeSession(generated);
		volumeBuilder.finalizeSession(generated);
		await tickBuilder.finish();
		await volumeBuilder.finish();

		expect(tickSink.pushes.map((rows) => rows.length)).toEqual([0, 1, 0]);
		expect(volumeSink.pushes.map((rows) => rows.length)).toEqual([0, 2, 0]);
		expect(tickBuilder.summary().timeframes['100t']?.count).toBe(1);
		expect(volumeBuilder.summary().timeframes['500v']?.count).toBe(2);
	});

	it('pushes generated price-level output into the retained sink', async () => {
		const sink = createPriceLevelRetainedSink();
		const builder = new PriceLevelBuilder(sink, retainedWindow({ startSessionIndex: 1 }));
		const skipped = session({ generated: true, index: 0 });
		const retained = session({ generated: true, index: 1 });

		builder.startSession(skipped);
		expect(builder.isTickActive()).toBe(false);
		builder.step(tick({ session: skipped, time: 0 }));
		builder.finalizeSession(skipped);

		builder.startSession(retained);
		expect(builder.isTickActive()).toBe(true);
		builder.step(tick({ price: 6000, session: retained, side: 'ask', time: 0, volume: 2 }));
		builder.pushTickValues(1000, 6001, 3, 'bid');
		builder.finalizeSession(retained);
		await builder.finish();

		expect(sink.pushes.map((rows) => rows.length)).toEqual([0, 2, 0]);
		expect(sink.pushes[1][0]).toMatchObject({
			askVolume: 2,
			bidVolume: 0,
			close: 6000,
			volume: 2
		});
		expect(sink.pushes[1][1]).toMatchObject({
			askVolume: 0,
			bidVolume: 3,
			close: 6001,
			volume: 3
		});
		expect(builder.summary().timeframes['1s']?.count).toBe(2);
	});

	it('flushes time retained builders at session boundaries and keeps side volume', () => {
		const sink = createRetainedSink();
		const builder = new TimeBuilder('5m', sink, retainedWindow());
		const firstSession = session({ generated: true, index: 0 });
		const secondSession = session({ generated: true, index: 1 });

		builder.startSession(firstSession);
		builder.step(tick({ session: firstSession, side: 'ask', time: 0, volume: 2 }));
		builder.pushTickValues(300_000, 6001, 3, 'bid');
		builder.finalizeSession(firstSession);

		builder.startSession(secondSession);
		builder.step(tick({ session: secondSession, side: 'ask', time: 600_000, volume: 5 }));
		builder.pushTickValues(900_000, 6002, 7, 'bid');
		builder.finalizeSession(secondSession);

		expect(sink.pushes[0][0]).toMatchObject({
			askVolume: 2,
			bidVolume: 0,
			volume: 2
		});
		expect(sink.pushes[1][0]).toMatchObject({
			askVolume: 5,
			bidVolume: 0,
			volume: 5
		});
	});
});

function createStreamingSink(): StandardStreamingCandleSink & { writes: MdCandle[][] } {
	const writes: MdCandle[][] = [];

	return {
		close: vi.fn<() => Promise<void>>(),
		open: vi.fn<() => Promise<void>>(),
		rowCount: 0,
		summary: () => ({
			count: writes.reduce((count, rows) => count + rows.length, 0),
			range: { endTime: 1000, startTime: 1000 }
		}),
		write: vi.fn<(candles: MdCandle[]) => Promise<void>>(async (candles) => {
			writes.push([...candles]);
		}),
		writes
	};
}

function createPriceLevelRetainedSink(): PriceLevelRetainedCandleSink & { pushes: MdCandle[][] } {
	const pushes: MdCandle[][] = [];

	return {
		finish: vi.fn<() => Promise<void>>(),
		push: vi.fn<(candles: MdCandle[]) => void>((candles) => {
			pushes.push([...candles]);
		}),
		pushes,
		summary: () => ({
			count: pushes.reduce((count, rows) => count + rows.length, 0),
			range: { endTime: 1000, startTime: 0 }
		})
	} as PriceLevelRetainedCandleSink & { pushes: MdCandle[][] };
}

function createRetainedSink(): StandardRetainedCandleSink & { pushes: MdCandle[][] } {
	const pushes: MdCandle[][] = [];

	return {
		finish: vi.fn<() => Promise<void>>(),
		push: vi.fn<(candles: MdCandle[]) => void>((candles) => {
			pushes.push([...candles]);
		}),
		pushes,
		summary: () => ({
			count: pushes.reduce((count, rows) => count + rows.length, 0),
			range: { endTime: 1000, startTime: 0 }
		})
	};
}

function retainedWindow(
	overrides: Partial<{ initialBarPosition: number; startSessionIndex: number }> = {}
) {
	return {
		initialBarPosition: 0,
		startSessionIndex: 0,
		...overrides
	};
}

function session(overrides: Partial<GenerationSession> = {}): GenerationSession {
	return {
		generated: true,
		index: 0,
		start: 1000,
		...overrides
	};
}

function tick(overrides: Partial<GeneratedTick> = {}): GeneratedTick {
	return {
		index: 0,
		price: 6000,
		session: session(),
		side: 'ask',
		time: 0,
		volume: 1,
		...overrides
	};
}
