import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { cwd } from 'node:process';
import { describe, expect, it } from 'vitest';

import { TIMEFRAME_DEFINITIONS } from '../../../contracts/timeframes.ts';
import { generateMarketData } from '../../../md-generation/generate-market-data.ts';
import { normalizeInputs } from '../../../md-generation/inputs.ts';
import { countGeneratedTickTimeBuckets } from '../../../md-generation/ticks.ts';
import { DEPTH_HEADER_SIZE, DEPTH_RECORD_SIZE } from '../../../shared/file-ops/depth.ts';

const E2E_SESSION_COUNT = 20;
const E2E_TICKS_PER_SESSION = 1_000;
const SCID_HEADER_BYTES = 56;
const SCID_RECORD_BYTES = 40;

describe('md-generation e2e', () => {
	const symbol = process.env.E2E_SYMBOL ?? 'ES';

	it('writes generated depth history and keeps output deterministic', async () => {
		const dataInRoot = join(cwd(), 'data-in');
		const outputDir = join(dataInRoot, symbol);

		await rm(outputDir, { force: true, recursive: true });

		const first = await generateMarketData(
			normalizeInputs({
				sessionCount: E2E_SESSION_COUNT,
				symbol,
				ticksPerSession: E2E_TICKS_PER_SESSION
			})
		);
		const priceLevelRowsPerSession = countGeneratedTickTimeBuckets(
			E2E_TICKS_PER_SESSION,
			TIMEFRAME_DEFINITIONS['1s'].milliseconds
		);
		const retainedPriceLevelRows = E2E_SESSION_COUNT * priceLevelRowsPerSession;

		expect(first.inputs.sessionCount).toBe(E2E_SESSION_COUNT);
		expect(first.inputs.ticksPerSession).toBe(E2E_TICKS_PER_SESSION);
		expect(first.counts.ticks).toBe(E2E_SESSION_COUNT * E2E_TICKS_PER_SESSION);
		expect(first.counts.daily).toBe(E2E_SESSION_COUNT);
		expect(first.counts.priceLevel).toBe(retainedPriceLevelRows);
		expect(first.counts.orderbook).toBeGreaterThan(first.counts.ticks);
		expect(await countRows(first.files.daily)).toBe(first.counts.daily);
		expect(await countRows(first.files.priceLevel)).toBe(first.counts.priceLevel);
		expect(await countRows(first.files.seconds15)).toBe(first.counts.seconds15);
		expect(await countRows(first.files.minutes5)).toBe(first.counts.minutes5);
		expect(await countRows(first.files.range10)).toBe(first.counts.range10);
		expect(await countRows(first.files.tick100)).toBe(first.counts.tick100);
		expect(await countRows(first.files.volume500)).toBe(first.counts.volume500);
		expect(await countDepthRecords(first.files.orderbook)).toBe(first.counts.orderbook);
		const firstOrderbookHashes = await hashDepthFiles(first.files.orderbook);
		expect((await stat(first.files.scid)).size).toBe(
			SCID_HEADER_BYTES + first.counts.ticks * SCID_RECORD_BYTES
		);

		const firstHashes = await hashGeneratedFiles(first.inputs.outputDir);
		const second = await generateMarketData(
			normalizeInputs({
				sessionCount: E2E_SESSION_COUNT,
				symbol,
				ticksPerSession: E2E_TICKS_PER_SESSION
			})
		);
		expect(await hashGeneratedFiles(second.inputs.outputDir)).toEqual(firstHashes);
		expect(await hashDepthFiles(second.files.orderbook)).toEqual(firstOrderbookHashes);
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

async function getDepthFiles(directory: string) {
	return (await readdir(directory)).filter((fileName) => fileName.endsWith('.depth')).sort();
}

async function countDepthRecords(directory: string) {
	let records = 0;

	for (const fileName of await getDepthFiles(directory)) {
		const file = await stat(join(directory, fileName));

		records += (file.size - DEPTH_HEADER_SIZE) / DEPTH_RECORD_SIZE;
	}

	return records;
}

async function hashDepthFiles(directory: string) {
	const hashes: Record<string, string> = {};

	for (const fileName of await getDepthFiles(directory)) {
		hashes[fileName] = await hashFile(join(directory, fileName));
	}

	return hashes;
}
