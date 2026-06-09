import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { generateMarketData } from '../../domain/generate-market-data.ts';
import { normalizeInputs } from '../../domain/inputs.ts';

const REQUESTED_DAILY_SESSIONS = 20_000;
const GENERATED_TICK_SESSIONS = 14_721; // this is not 20k because session before Unix epoch are padded
const TICKS_PER_GENERATED_SESSION = 10_000;
const RETAINED_PRICE_LEVEL_SESSIONS = 30;
const RETAINED_RING_BARS = 20_000;
const SCID_HEADER_BYTES = 56;
const SCID_RECORD_BYTES = 40;

describe('full ES generation', () => {
	it('writes the expected full-run lengths and keeps output deterministic', async () => {
		const firstRoot = await mkdtemp(join(tmpdir(), 'market-data-e2e-hash-'));
		const secondRoot = await mkdtemp(join(tmpdir(), 'market-data-e2e-hash-'));

		try {
			// 1st test: single-run expectations
			const first = await generateMarketData(
				normalizeInputs({
					outputDir: firstRoot,
					symbol: 'ES'
				})
			);

			expect(first.inputs.sessionCount).toBe(REQUESTED_DAILY_SESSIONS);
			expect(first.inputs.ticksPerSession).toBe(TICKS_PER_GENERATED_SESSION);
			expect(first.counts.ticks).toBe(
				GENERATED_TICK_SESSIONS * TICKS_PER_GENERATED_SESSION
			);
			expect(first.counts.daily).toBe(REQUESTED_DAILY_SESSIONS);
			expect(first.counts.priceLevel).toBe(
				RETAINED_PRICE_LEVEL_SESSIONS * TICKS_PER_GENERATED_SESSION
			);
			expect(first.counts.seconds15).toBe(RETAINED_RING_BARS);
			expect(first.counts.minutes5).toBe(RETAINED_RING_BARS);
			expect(first.counts.volume500).toBe(RETAINED_RING_BARS);
			expect(await countJsonArrayItems(first.files.daily)).toBe(
				REQUESTED_DAILY_SESSIONS
			);
			expect(await countJsonArrayItems(first.files.priceLevel)).toBe(
				RETAINED_PRICE_LEVEL_SESSIONS * TICKS_PER_GENERATED_SESSION
			);
			expect(await countJsonArrayItems(first.files.seconds15)).toBe(
				RETAINED_RING_BARS
			);
			expect(await countJsonArrayItems(first.files.minutes5)).toBe(
				RETAINED_RING_BARS
			);
			expect(await countJsonArrayItems(first.files.volume500)).toBe(
				RETAINED_RING_BARS
			);
			expect((await stat(first.files.scid)).size).toBe(
				SCID_HEADER_BYTES +
					GENERATED_TICK_SESSIONS *
						TICKS_PER_GENERATED_SESSION *
						SCID_RECORD_BYTES
			);

			// 2nd test: deterministic output
			const firstHashes = await hashGeneratedFiles(first.inputs.outputDir);
			const second = await generateMarketData(
				normalizeInputs({
					outputDir: secondRoot,
					symbol: 'ES'
				})
			);
			expect(await hashGeneratedFiles(second.inputs.outputDir)).toEqual(
				firstHashes
			);
		} finally {
			await rm(firstRoot, { force: true, recursive: true });
			await rm(secondRoot, { force: true, recursive: true });
		}
	});
});

async function hashGeneratedFiles(directory: string) {
	const fileNames = (await readdir(directory)).sort();
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

async function countJsonArrayItems(filePath: string) {
	const json = await readFile(filePath, 'utf8');
	let depth = 0;
	let count = 0;
	let hasCurrentItem = false;
	let inString = false;
	let isEscaped = false;

	for (const character of json) {
		if (inString) {
			if (isEscaped) {
				isEscaped = false;
			} else if (character === '\\') {
				isEscaped = true;
			} else if (character === '"') {
				inString = false;
			}
			continue;
		}

		if (character === '"') {
			inString = true;
			continue;
		}

		if (character === '[' || character === '{') {
			depth++;
			if (depth === 2) hasCurrentItem = true;
			continue;
		}

		if (character === ']' || character === '}') {
			if (depth === 2 && hasCurrentItem) {
				count++;
				hasCurrentItem = false;
			}
			depth--;
		}
	}

	return count;
}
