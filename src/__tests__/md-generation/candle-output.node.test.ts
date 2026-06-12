import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { MdCandle } from '../../contracts/types.ts';
import {
	createRetainedCandleSink,
	createStreamingCandleSink
} from '../../md-generation/candle-output.ts';

describe('candle output sinks', () => {
	it('throws for retained summaries before rows are materialized or when empty', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'candle-output-empty-'));
		const sink = createRetainedCandleSink(join(directory, 'empty.csv'), '15s', 2);

		try {
			expect(() => sink.summary()).toThrow('Timeframe 15s rows were not materialized');

			await sink.finish();

			expect(() => sink.summary()).toThrow('Cannot write metadata for empty 15s candle range');
		} finally {
			await rm(directory, { force: true, recursive: true });
		}
	});

	it('materializes only retained rows and reports their range', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'candle-output-retained-'));
		const filePath = join(directory, 'retained.csv');
		const sink = createRetainedCandleSink(filePath, '15s', 2);

		try {
			sink.push([candle({ pos: 0, time: 1000 })]);
			sink.push([candle({ pos: 1, time: 2000 }), candle({ pos: 2, time: 3000 })]);
			await sink.finish();

			expect(sink.summary()).toEqual({
				count: 2,
				range: {
					endTime: 3000,
					startTime: 2000
				}
			});
			expect((await readFile(filePath, 'utf8')).trimEnd().split('\n')).toHaveLength(3);
		} finally {
			await rm(directory, { force: true, recursive: true });
		}
	});

	it('streams rows and rejects empty metadata ranges', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'candle-output-streaming-'));
		const filePath = join(directory, 'streaming.csv');
		const sink = createStreamingCandleSink(filePath, '1d');

		try {
			await sink.open();
			await sink.write([]);
			expect(() => sink.summary()).toThrow('Cannot write metadata for empty 1d candle range');

			await sink.write([candle({ pos: 0, time: 1000 }), candle({ pos: 1, time: 2000 })]);
			await sink.close();

			expect(sink.summary()).toEqual({
				count: 2,
				range: {
					endTime: 2000,
					startTime: 1000
				}
			});
			expect((await readFile(filePath, 'utf8')).trimEnd().split('\n')).toHaveLength(3);
		} finally {
			await rm(directory, { force: true, recursive: true });
		}
	});
});

function candle(overrides: Partial<MdCandle> = {}): MdCandle {
	return {
		askVolume: 1,
		bidVolume: 0,
		close: 6000,
		high: 6000,
		id: BigInt(overrides.time ?? 1000) * 1_000_000n,
		low: 6000,
		open: 6000,
		pos: 0,
		time: 1000,
		volume: 1,
		vwap: 6000,
		...overrides
	};
}
