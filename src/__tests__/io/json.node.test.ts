import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { MdCandle, MdCandleVolumeByPrice } from '../../contracts/types.ts';
import {
	CandleJsonArrayWriter,
	toStoredCandle,
	toStoredPriceLevelCandle
} from '../../io/json.ts';

describe('json output', () => {
	it('stores bigint candle ids as strings', () => {
		expect(toStoredCandle(candle())).toEqual({
			close: 100.5,
			high: 101,
			id: '1700000000000000000',
			low: 99,
			open: 100,
			pos: 0,
			time: 1_700_000_000_000,
			volume: 15,
			vwap: 100.25
		});
	});

	it('stores price maps as entry arrays', () => {
		expect(toStoredPriceLevelCandle(priceLevelCandle())).toEqual({
			close: 100.5,
			high: 101,
			id: '1700000000000000000',
			low: 99,
			open: 100,
			pos: 0,
			prices: [
				[100, 5],
				[100.25, 10]
			],
			time: 1_700_000_000_000,
			volume: 15,
			vwap: 100.25
		});
	});

	it('streams candles to a JSON array file', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'market-data-json-'));
		const filePath = join(directory, 'nested', 'tradester_ES_5m.json');

		try {
			const writer = new CandleJsonArrayWriter(filePath, toStoredCandle);
			await writer.open();
			await writer.write([candle()]);
			await writer.write([candle({ close: 102, id: 1n, pos: 1 })]);
			await writer.close();

			expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual([
				toStoredCandle(candle()),
				toStoredCandle(candle({ close: 102, id: 1n, pos: 1 }))
			]);
		} finally {
			await rm(directory, { force: true, recursive: true });
		}
	});
});

function candle(overrides: Partial<MdCandle> = {}): MdCandle {
	return {
		close: 100.5,
		high: 101,
		id: 1_700_000_000_000_000_000n,
		low: 99,
		open: 100,
		pos: 0,
		time: 1_700_000_000_000,
		volume: 15,
		vwap: 100.25,
		...overrides
	};
}

function priceLevelCandle(): MdCandleVolumeByPrice {
	return {
		...candle(),
		prices: new Map([
			[100, 5],
			[100.25, 10]
		])
	};
}
