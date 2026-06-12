// This e2e intentionally exercises the real CLI generation path with default full-run inputs. Do not shrink this to fixture data, snippets, mocks, or reduced counts.

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { cwd } from 'node:process';
import { describe, expect, it } from 'vitest';

import { DEFAULT_SESSION_COUNT, DEFAULT_TICKS_PER_SESSION } from '../../../contracts/defaults.ts';
import { TIMEFRAME_DEFINITIONS } from '../../../contracts/timeframes.ts';
import {
	DEPTH_RETAINED_SESSION_COUNT,
	PRICE_LEVEL_RETAINED_SESSION_COUNT,
	RETAINED_CANDLE_BAR_COUNT
} from '../../../md-generation/pipeline/pipeline-constants.ts';
import { countGeneratedTickTimeBuckets } from '../../../md-generation/tick-engine/session-ticks.ts';
import { runCli } from '../../../shared/cli/run-cli.ts';
import { DEPTH_HEADER_SIZE, DEPTH_RECORD_SIZE } from '../../../shared/file-ops/depth.ts';
import { SCID_HEADER_SIZE, SCID_RECORD_SIZE } from '../../../shared/file-ops/scid.ts';

const GENERATED_TICK_SESSIONS = 14_721;

describe('md-generation e2e', () => {
	const symbol = process.env.E2E_SYMBOL ?? 'ES';

	it('writes full generated depth history and keeps output deterministic', async () => {
		const dataInRoot = join(cwd(), 'data-in');
		const outputDir = join(dataInRoot, symbol);

		await rm(outputDir, { force: true, recursive: true });

		const first = await runCli(symbol, createSilentPorts());
		const priceLevelRowsPerSession = countGeneratedTickTimeBuckets(
			DEFAULT_TICKS_PER_SESSION,
			TIMEFRAME_DEFINITIONS['1s'].milliseconds
		);
		const retainedPriceLevelRows = PRICE_LEVEL_RETAINED_SESSION_COUNT * priceLevelRowsPerSession;

		expect(first.inputs.sessionCount).toBe(DEFAULT_SESSION_COUNT);
		expect(first.inputs.ticksPerSession).toBe(DEFAULT_TICKS_PER_SESSION);
		expect(first.counts.ticks).toBe(GENERATED_TICK_SESSIONS * DEFAULT_TICKS_PER_SESSION);
		expect(first.counts.timeframes['1d']).toBe(DEFAULT_SESSION_COUNT);
		expect(first.counts.timeframes['1s']).toBe(retainedPriceLevelRows);
		expect(first.counts.timeframes['15s']).toBe(RETAINED_CANDLE_BAR_COUNT);
		expect(first.counts.timeframes['5m']).toBe(RETAINED_CANDLE_BAR_COUNT);
		expect(first.counts.timeframes['10r']).toBe(RETAINED_CANDLE_BAR_COUNT);
		expect(first.counts.timeframes['100t']).toBe(RETAINED_CANDLE_BAR_COUNT);
		expect(first.counts.timeframes['500v']).toBe(RETAINED_CANDLE_BAR_COUNT);
		expect(await getDepthFiles(first.files.orderbook)).toHaveLength(DEPTH_RETAINED_SESSION_COUNT);
		expect(first.counts.orderbook).toBeGreaterThan(
			DEPTH_RETAINED_SESSION_COUNT * DEFAULT_TICKS_PER_SESSION
		);
		expect(await countRows(first.files.timeframes['1d'])).toBe(DEFAULT_SESSION_COUNT);
		expect(await countRows(first.files.timeframes['1s'])).toBe(retainedPriceLevelRows);
		expect(await countRows(first.files.timeframes['15s'])).toBe(RETAINED_CANDLE_BAR_COUNT);
		expect(await countRows(first.files.timeframes['5m'])).toBe(RETAINED_CANDLE_BAR_COUNT);
		expect(await countRows(first.files.timeframes['10r'])).toBe(RETAINED_CANDLE_BAR_COUNT);
		expect(await countRows(first.files.timeframes['100t'])).toBe(RETAINED_CANDLE_BAR_COUNT);
		expect(await countRows(first.files.timeframes['500v'])).toBe(RETAINED_CANDLE_BAR_COUNT);
		expect(await countDepthRecords(first.files.orderbook)).toBe(first.counts.orderbook);
		const firstOrderbookHashes = await hashDepthFiles(first.files.orderbook);
		expect((await stat(first.files.scid)).size).toBe(
			SCID_HEADER_SIZE + first.counts.ticks * SCID_RECORD_SIZE
		);

		const firstHashes = await hashGeneratedFiles(first.inputs.outputDir);
		const second = await runCli(symbol, createSilentPorts());
		expect(await hashGeneratedFiles(second.inputs.outputDir)).toEqual(firstHashes);
		expect(await hashDepthFiles(second.files.orderbook)).toEqual(firstOrderbookHashes);
	});
});

function createSilentPorts() {
	return {
		log: () => {},
		spinner: () => ({
			error: () => {},
			start: () => {},
			stop: () => {}
		})
	};
}

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
