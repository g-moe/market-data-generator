import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { Candle } from '../../contracts/types.ts';
import {
	serializeCandlesToScid,
	toScDateTimeMs,
	writeCandlesScid
} from '../../io/scid.ts';

describe('scid output', () => {
	it('serializes the Sierra Chart intraday header and records', () => {
		const output = serializeCandlesToScid([candle()]);

		expect(output).toHaveLength(96);
		expect(output.toString('ascii', 0, 4)).toBe('SCID');
		expect(output.readUInt32LE(4)).toBe(56);
		expect(output.readUInt32LE(8)).toBe(40);
		expect(output.readUInt16LE(12)).toBe(1);
		expect(output.readUInt16LE(14)).toBe(0);
		expect(output.readUInt32LE(16)).toBe(0);

		const offset = 56;
		expect(output.readBigInt64LE(offset)).toBe(
			toScDateTimeMs(new Date('2026-06-08T22:00:00.000Z'))
		);
		expect(output.readFloatLE(offset + 8)).toBe(100);
		expect(output.readFloatLE(offset + 12)).toBe(101);
		expect(output.readFloatLE(offset + 16)).toBe(99);
		expect(output.readFloatLE(offset + 20)).toBe(100.5);
		expect(output.readUInt32LE(offset + 24)).toBe(3);
		expect(output.readUInt32LE(offset + 28)).toBe(15);
		expect(output.readUInt32LE(offset + 32)).toBe(7);
		expect(output.readUInt32LE(offset + 36)).toBe(8);
	});

	it('creates parent directories and overwrites existing files', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'market-data-scid-'));
		const filePath = join(directory, 'nested', 'ES.scid');

		try {
			await mkdir(join(directory, 'nested'), { recursive: true });
			await writeFile(filePath, 'old data');
			await writeCandlesScid(filePath, [candle(), candle({ close: 101 })]);

			const output = await readFile(filePath);
			expect(output).toHaveLength(136);
			expect(output.toString('ascii', 0, 4)).toBe('SCID');
			expect(output.readFloatLE(56 + 40 + 20)).toBe(101);
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
		open: 100,
		time: new Date('2026-06-08T22:00:00.000Z'),
		transactions: 3,
		volume: 15,
		...overrides
	};
}
