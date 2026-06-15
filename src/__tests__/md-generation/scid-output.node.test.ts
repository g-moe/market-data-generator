import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { TIMEFRAME_KEYS, type TimeframeKey } from '../../contracts/timeframes.ts';
import type { OutputMetadata } from '../../contracts/types.ts';
import { writeAlignedScids } from '../../md-generation/scid-output.ts';
import {
	SCID_EPOCH_OFFSET_MS,
	SCID_HEADER_SIZE,
	SCID_RECORD_SIZE,
	ScidTickWriter
} from '../../shared/file-ops/scid.ts';

describe('writeAlignedScids', () => {
	it('writes non-daily SCIDs from each timeframe metadata start time', async () => {
		const root = await mkdtemp(join(tmpdir(), 'aligned-scids-'));
		const scids = createScidFiles(root);
		const metadata = {
			timeframes: Object.fromEntries(
				TIMEFRAME_KEYS.map((key) => [
					key,
					{
						endTime: 4000,
						startTime: key === '1s' ? 2000 : 3000
					}
				])
			)
		} as OutputMetadata;

		try {
			const writer = new ScidTickWriter(scids['1d']);
			await writer.open();
			writer.pushTickValues(1000, 6000, 500, 'ask');
			writer.pushTickValues(2000, 6001, 500, 'bid');
			writer.pushTickValues(3000, 6002, 500, 'ask');
			await writer.close();

			await writeAlignedScids({
				metadata,
				scids,
				sessions: [session(0)],
				ticksPerSession: 3
			});

			expect(readScidTimes(await readFile(scids['1s']))).toEqual([2000, 3000]);
			expect(readScidTimes(await readFile(scids['5m']))).toEqual([3000]);
			expect(readScidTimes(await readFile(scids['10r']))).toEqual([3000]);
			expect(readScidTimes(await readFile(scids['15s']))).toEqual([3000]);
			expect(readScidTimes(await readFile(scids['100t']))).toEqual([3000]);
			expect(readScidTimes(await readFile(scids['500v']))).toEqual([3000]);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it('trims the first 500v record when the retained bar starts inside a tick', async () => {
		const root = await mkdtemp(join(tmpdir(), 'aligned-volume-scid-'));
		const scids = createScidFiles(root);
		const metadata = {
			timeframes: Object.fromEntries(
				TIMEFRAME_KEYS.map((key) => [
					key,
					{
						endTime: 3000,
						startTime: key === '500v' ? 2000 : 3000
					}
				])
			)
		} as OutputMetadata;

		try {
			const writer = new ScidTickWriter(scids['1d']);
			await writer.open();
			writer.pushTickValues(1000, 6000, 250, 'ask');
			writer.pushTickValues(2000, 6001, 300, 'bid');
			writer.pushTickValues(3000, 6002, 500, 'ask');
			await writer.close();

			await writeAlignedScids({
				metadata,
				scids,
				sessions: [session(0)],
				ticksPerSession: 3
			});

			expect(readScidVolumes(await readFile(scids['500v']))).toEqual([50, 500]);
			expect(readScidVolumes(await readFile(scids['1s']))).toEqual([500]);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});

function readScidTimes(output: Buffer) {
	const times: number[] = [];

	for (let offset = SCID_HEADER_SIZE; offset < output.length; offset += SCID_RECORD_SIZE) {
		times.push(Math.floor(Number(output.readBigInt64LE(offset)) / 1000) + SCID_EPOCH_OFFSET_MS);
	}

	return times;
}

function createScidFiles(root: string) {
	return Object.fromEntries(
		TIMEFRAME_KEYS.map((key) => [key, join(root, `tradester_ES_${key}.scid`)])
	) as Record<TimeframeKey, string>;
}

function readScidVolumes(output: Buffer) {
	const volumes: number[] = [];

	for (let offset = SCID_HEADER_SIZE; offset < output.length; offset += SCID_RECORD_SIZE) {
		volumes.push(output.readUInt32LE(offset + 28));
	}

	return volumes;
}

function session(start: number) {
	return {
		generated: true,
		index: 0,
		start
	};
}
