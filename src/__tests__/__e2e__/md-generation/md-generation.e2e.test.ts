import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { cwd } from 'node:process';
import { describe, expect, it } from 'vitest';

import { generateMarketData } from '../../../md-generation/generate-market-data.ts';
import { normalizeInputs } from '../../../md-generation/inputs.ts';

const REQUESTED_DAILY_SESSIONS = 20_000;
const GENERATED_TICK_SESSIONS = 14_721; // this is not 20k because session before Unix epoch are padded
const TICKS_PER_GENERATED_SESSION = 10_000;
const RETAINED_PRICE_LEVEL_SESSIONS = 30;
const RETAINED_RING_BARS = 20_000;
const SCID_HEADER_BYTES = 56;
const SCID_RECORD_BYTES = 40;

describe('md-generation e2e', () => {
	const symbol = process.env.E2E_SYMBOL ?? 'ES';

	it('writes the expected full-run lengths and keeps output deterministic', async () => {
		const dataInRoot = join(cwd(), 'data-in');
		const outputDir = join(dataInRoot, symbol);

		await rm(outputDir, { force: true, recursive: true });

		const first = await generateMarketData(
			normalizeInputs({
				symbol
			})
		);

		expect(first.inputs.sessionCount).toBe(REQUESTED_DAILY_SESSIONS);
		expect(first.inputs.ticksPerSession).toBe(TICKS_PER_GENERATED_SESSION);
		expect(first.counts.ticks).toBe(GENERATED_TICK_SESSIONS * TICKS_PER_GENERATED_SESSION);
		expect(first.counts.daily).toBe(REQUESTED_DAILY_SESSIONS);
		expect(first.counts.priceLevel).toBe(
			RETAINED_PRICE_LEVEL_SESSIONS * TICKS_PER_GENERATED_SESSION
		);
		expect(first.counts.seconds15).toBe(RETAINED_RING_BARS);
		expect(first.counts.minutes5).toBe(RETAINED_RING_BARS);
		expect(first.counts.range10).toBe(RETAINED_RING_BARS);
		expect(first.counts.tick100).toBe(RETAINED_RING_BARS);
		expect(first.counts.volume500).toBe(RETAINED_RING_BARS);
		expect(await countRows(first.files.daily)).toBe(REQUESTED_DAILY_SESSIONS);
		expect(await countRows(first.files.priceLevel)).toBe(
			RETAINED_PRICE_LEVEL_SESSIONS * TICKS_PER_GENERATED_SESSION
		);
		expect(await countRows(first.files.seconds15)).toBe(RETAINED_RING_BARS);
		expect(await countRows(first.files.minutes5)).toBe(RETAINED_RING_BARS);
		expect(await countRows(first.files.range10)).toBe(RETAINED_RING_BARS);
		expect(await countRows(first.files.tick100)).toBe(RETAINED_RING_BARS);
		expect(await countRows(first.files.volume500)).toBe(RETAINED_RING_BARS);
		expect((await stat(first.files.scid)).size).toBe(
			SCID_HEADER_BYTES + GENERATED_TICK_SESSIONS * TICKS_PER_GENERATED_SESSION * SCID_RECORD_BYTES
		);

		const firstHashes = await hashGeneratedFiles(first.inputs.outputDir);
		const second = await generateMarketData(
			normalizeInputs({
				symbol
			})
		);
		expect(await hashGeneratedFiles(second.inputs.outputDir)).toEqual(firstHashes);
	});
});

async function hashGeneratedFiles(directory: string) {
	const fileNames = (await readdir(directory))
		.filter((fileName) => fileName.endsWith('.csv'))
		.sort();
	const hashes: Record<string, string> = {};

	for (const fileName of fileNames) {
		hashes[fileName] = await hashFile(join(directory, fileName));
	}

	return hashes;
}

function hashFile(filePath: string) {
	return new Promise<string>((resolve, reject) => {
		const hash = createHash('sha256');
		const input = createReadStream(filePath);

		input.on('data', (chunk) => hash.update(chunk));
		input.once('error', reject);
		input.once('end', () => resolve(hash.digest('hex')));
	});
}

async function countRows(filePath: string) {
	const text = await readFile(filePath, 'utf8');
	return text.trimEnd().split('\n').length - 1;
}
