import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { serializeCandlesToCsv, writeCandlesCsv } from '../../io/csv.ts';
import type { Candle } from '../../contracts/types.ts';

describe('csv output', () => {
	it('serializes candles with the expected header and central time columns', () => {
		expect(serializeCandlesToCsv([candle()])).toBe(
			[
				'Date,Time,Open,High,Low,Close,Volume,Number of Trades,Bid Volume,Ask Volume',
				'2026-06-08,17:00:00,100,101,99,100.5,15,3,7,8'
			].join('\n')
		);
	});

	it('creates parent directories and overwrites existing files', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'market-data-csv-'));
		const filePath = join(directory, 'nested', 'ES_minute_1.csv');

		try {
			await writeFile(join(directory, 'old.csv'), 'old data');
			await writeCandlesCsv(filePath, [candle()]);

			expect(await readFile(filePath, 'utf8')).toBe(
				`${serializeCandlesToCsv([candle()])}\n`
			);
		} finally {
			await rm(directory, { force: true, recursive: true });
		}
	});
});

function candle(overrides: Partial<Candle> = {}): Candle {
	return {
		askVolume: 8,
		bidVolume: 7,
		close: 100.5,
		high: 101,
		isNewTradingDay: false,
		low: 99,
		transactions: 3,
		open: 100,
		time: new Date('2026-06-08T17:00:00.000-05:00'),
		volume: 15,
		...overrides
	};
}
