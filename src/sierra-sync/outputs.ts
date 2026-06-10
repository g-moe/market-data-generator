import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { findSymbol, getSymbolConfig } from '../contracts/symbols.ts';
import {
	DEFAULT_DATA_OUT_TEMP_ROOT,
	SIERRA_EXPORT_POLL_INTERVAL_MS,
	SIERRA_EXPORT_TIMEOUT_MS,
	SIERRA_LATEST_RUN_NAME
} from './constants.ts';

const EXPORT_KEYS = [
	'priceLevel',
	'seconds15',
	'volume500',
	'minutes5',
	'daily'
] as const;

type ExportKey = (typeof EXPORT_KEYS)[number];

export type SierraExportFiles = Record<ExportKey, string>;

export function sierraExportFiles(symbol: string): SierraExportFiles {
	const { symbolId } = getSymbolConfig(resolveSymbol(symbol));
	return {
		daily: `tradester_${symbolId}_1d_GraphData.txt`,
		minutes5: `tradester_${symbolId}_5m_GraphData.txt`,
		priceLevel: `tradester_${symbolId}_1s_GraphData.txt`,
		seconds15: `tradester_${symbolId}_15s_GraphData.txt`,
		volume500: `tradester_${symbolId}_500v_GraphData.txt`
	};
}

export function latestSierraOutputDir({
	dataOutTempRoot = DEFAULT_DATA_OUT_TEMP_ROOT,
	symbol
}: {
	dataOutTempRoot?: string;
	symbol: string;
}) {
	const { symbolId } = getSymbolConfig(resolveSymbol(symbol));
	return resolve(dataOutTempRoot, symbolId, SIERRA_LATEST_RUN_NAME);
}

export async function resetLatestSierraOutputs(directory: string) {
	await rm(directory, { force: true, recursive: true });
	await mkdir(directory, { recursive: true });
}

export async function waitForFreshSierraOutputs({
	directory,
	exportFiles,
	pollIntervalMs = SIERRA_EXPORT_POLL_INTERVAL_MS,
	startedAt,
	timeoutMs = SIERRA_EXPORT_TIMEOUT_MS
}: {
	directory: string;
	exportFiles: SierraExportFiles;
	pollIntervalMs?: number;
	startedAt: number;
	timeoutMs?: number;
}) {
	const filePaths = Object.values(exportFiles).map((fileName) =>
		join(directory, fileName)
	);
	const deadline = Date.now() + timeoutMs;
	while (Date.now() <= deadline) {
		const staleOrMissing = await staleOrMissingFiles(filePaths, startedAt);

		if (staleOrMissing.length === 0) {
			return filePaths;
		}

		await sleep(pollIntervalMs);
	}

	const staleOrMissing = await staleOrMissingFiles(filePaths, startedAt);
	throw new Error(
		`Timed out waiting for fresh Sierra exports:\n${staleOrMissing.join('\n')}`
	);
}

export async function copySierraOutputsToRun({
	exportFiles,
	fromDir,
	toDir
}: {
	exportFiles: SierraExportFiles;
	fromDir: string;
	toDir: string;
}) {
	await rm(toDir, { force: true, recursive: true });
	await mkdir(toDir, { recursive: true });
	const copied: SierraExportFiles = {} as SierraExportFiles;

	for (const key of EXPORT_KEYS) {
		const fileName = exportFiles[key];
		const target = join(toDir, fileName);
		await copyFile(join(fromDir, fileName), target);
		copied[key] = target;
	}

	return copied;
}

async function staleOrMissingFiles(filePaths: string[], startedAt: number) {
	const staleOrMissing: string[] = [];

	for (const filePath of filePaths) {
		try {
			const file = await stat(filePath);
			if (file.size <= 0 || file.mtimeMs < startedAt) {
				staleOrMissing.push(filePath);
			}
		} catch {
			staleOrMissing.push(filePath);
		}
	}

	return staleOrMissing;
}

function resolveSymbol(symbol: string) {
	const resolved = findSymbol(symbol);

	if (resolved === undefined) {
		throw new Error(`Unknown symbol ${symbol}`);
	}

	return resolved;
}

function sleep(milliseconds: number) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
