import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { MarketTick } from '../../../contracts/types.ts';
import { ScidTickWriter, tickToScidRecord, toScDateTimeMs } from '../../../shared/file-ops/scid.ts';
import { parseIsoToUnixMs } from '../../../shared/datetime/index.ts';

describe('scid output', () => {
	it('writes raw ticks as Sierra Chart intraday records', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'market-data-scid-'));
		const filePath = join(directory, 'tradester_ES_1d.scid');

		try {
			const writer = new ScidTickWriter(filePath);
			await writer.open();
			writer.pushTick(
				tick({
					side: 'bid',
					time: parseIsoToUnixMs('2026-06-08T22:00:00.000Z'),
					volume: 15
				})
			);
			await writer.close();
			const output = await readFile(filePath);

			expect(output).toHaveLength(96);
			expect(output.toString('ascii', 0, 4)).toBe('SCID');
			expect(output.readUInt32LE(4)).toBe(56);
			expect(output.readUInt32LE(8)).toBe(40);

			const offset = 56;
			expect(output.readBigInt64LE(offset)).toBe(
				toScDateTimeMs(parseIsoToUnixMs('2026-06-08T22:00:00.000Z'))
			);
			expect(output.readFloatLE(offset + 8)).toBe(6000);
			expect(output.readFloatLE(offset + 12)).toBe(6000);
			expect(output.readFloatLE(offset + 16)).toBe(6000);
			expect(output.readFloatLE(offset + 20)).toBe(6000);
			expect(output.readUInt32LE(offset + 24)).toBe(1);
			expect(output.readUInt32LE(offset + 28)).toBe(15);
			expect(output.readUInt32LE(offset + 32)).toBe(15);
			expect(output.readUInt32LE(offset + 36)).toBe(0);
		} finally {
			await rm(directory, { force: true, recursive: true });
		}
	});

	it('flushes without writes when no ticks are pending', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'market-data-scid-flush-'));
		const filePath = join(directory, 'tradester_ES_1d.scid');

		try {
			const writer = new ScidTickWriter(filePath);
			await writer.open();
			await writer.flush();
			await writer.close();

			const output = await readFile(filePath);
			expect(output.toString('ascii', 0, 4)).toBe('SCID');
			expect(output).toHaveLength(56);
		} finally {
			await rm(directory, { force: true, recursive: true });
		}
	});

	it('errors when writing after close', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'market-data-scid-closed-'));
		const filePath = join(directory, 'tradester_ES_1d.scid');

		try {
			const writer = new ScidTickWriter(filePath);
			await writer.open();
			await writer.close();

			expect(() => writer.pushTick(tick())).not.toThrow();
			await expect(writer.flush()).rejects.toThrow('SCID writer is not open');
		} finally {
			await rm(directory, { force: true, recursive: true });
		}
	});

	it('skips syncing when the buffered tick count is zero', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'market-data-scid-empty-sync-'));
		const filePath = join(directory, 'tradester_ES_1d.scid');

		try {
			const writer = new ScidTickWriter(filePath, 1);
			await writer.open();
			writer.pushTick(tick());

			await writer.flush();
			const withOutput = await readFile(filePath);

			(writer as unknown as { writeBufferedTicksSync: () => void }).writeBufferedTicksSync();

			await writer.close();
			const finalOutput = await readFile(filePath);

			expect(finalOutput).toEqual(withOutput);
		} finally {
			await rm(directory, { force: true, recursive: true });
		}
	});

	it('creates parent directories and overwrites existing files', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'market-data-scid-'));
		const filePath = join(directory, 'nested', 'tradester_ES_1d.scid');

		try {
			await mkdir(join(directory, 'nested'), { recursive: true });
			await writeFile(filePath, 'old data');
			const writer = new ScidTickWriter(filePath);
			await writer.open();
			writer.pushTick(tick());
			writer.pushTick(tick({ price: 6000.25 }));
			await writer.close();

			const output = await readFile(filePath);
			expect(output).toHaveLength(136);
			expect(output.toString('ascii', 0, 4)).toBe('SCID');
			expect(output.readFloatLE(56 + 40 + 20)).toBe(6000.25);
		} finally {
			await rm(directory, { force: true, recursive: true });
		}
	});

	it('converts bid and ask sides to separate volume fields', () => {
		expect(tickToScidRecord(tick({ side: 'ask', volume: 7 }))).toMatchObject({
			askVolume: 7,
			bidVolume: 0,
			volume: 7
		});
	});
});

function tick(overrides: Partial<MarketTick> = {}): MarketTick {
	return {
		price: 6000,
		sessionIndex: 0,
		side: 'ask',
		time: parseIsoToUnixMs('2026-06-08T22:00:00.000Z'),
		volume: 1,
		...overrides
	};
}
