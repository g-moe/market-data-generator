import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { MdCandle, MdCandleVolumeByPrice } from '../../contracts/types.ts';
import {
	CandleJsonArrayWriter,
	CandleRowWriter,
	CANDLE_ROW_HEADER,
	PRICE_LEVEL_CANDLE_ROW_HEADER,
	parseCandleRowsFast,
	toStoredCandle,
	toStoredCandleRow,
	toStoredPriceLevelCandleRow,
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

	it('streams candles to fixed-schema rows', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'market-data-rows-'));
		const filePath = join(directory, 'nested', 'tradester_ES_5m.csv');

		try {
			const writer = new CandleRowWriter(
				filePath,
				CANDLE_ROW_HEADER,
				toStoredCandleRow
			);
			await writer.open();
			await writer.write([candle()]);
			await writer.write([candle({ close: 102, id: 1n, pos: 1 })]);
			await writer.close();

			expect(await readFile(filePath, 'utf8')).toBe(`${CANDLE_ROW_HEADER}
1700000000000000000,1700000000000,0,100,101,99,100.5,15,100.25
1,1700000000000,1,100,101,99,102,15,100.25
`);
		} finally {
			await rm(directory, { force: true, recursive: true });
		}
	});

	it('serializes price levels as a single fixed-schema row field', () => {
		expect(toStoredPriceLevelCandleRow(priceLevelCandle())).toBe(
			'1700000000000000000,1700000000000,0,100,101,99,100.5,15,100.25,100:5;100.25:10'
		);
		expect(PRICE_LEVEL_CANDLE_ROW_HEADER).toBe(`${CANDLE_ROW_HEADER},prices`);
	});

	it('parses fixed-schema candle rows without row splitting', () => {
		const text = `${CANDLE_ROW_HEADER}
1700000000000000000,1700000000000,0,100,101,99,100.5,15,100.25
1,1700000060000,1,100.5,102,100.25,101.75,20,101.125
`;

		expect(parseCandleRowsFast(text)).toEqual([
			toStoredCandle(candle()),
			toStoredCandle(
				candle({
					close: 101.75,
					high: 102,
					id: 1n,
					low: 100.25,
					open: 100.5,
					pos: 1,
					time: 1_700_000_060_000,
					volume: 20,
					vwap: 101.125
				})
			)
		]);
	});

	it('rejects unexpected candle row headers', () => {
		expect(() =>
			parseCandleRowsFast(
				'id,time,pos,open,high,low,close,volume\n1,2,3,4,5,6,7,8\n'
			)
		).toThrow('Unexpected candle row header');
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
