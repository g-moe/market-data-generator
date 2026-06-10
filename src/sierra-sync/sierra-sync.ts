import { copyFile, mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type { GenerationResult } from '../contracts/types.ts';
import {
	buildSierraBridge,
	installSierraBridgeSource,
	type SierraBridgeBuildInputs
} from './bridge.ts';
import { loadExistingGenerationResult } from './existing-generation.ts';
import {
	copySierraOutputsToRun,
	resetLatestSierraOutputs,
	sierraExportFiles,
	type SierraExportFiles,
	waitForFreshSierraOutputs
} from './outputs.ts';
import {
	normalizeSierraSyncInputs,
	type RawSierraSyncInputs
} from './inputs.ts';
import {
	validateSierraOneSecondBars,
	type SierraBarValidationResult
} from './validation.ts';

export type SierraSyncResult = {
	generation: GenerationResult;
	bridgeSourcePath: string;
	bridgeInstalledPath: string;
	bridgeDllPaths: string[];
	sierraScidPath: string;
	latestOutputDir: string;
	outputDir: string;
	exportFiles: SierraExportFiles;
	copiedFiles: SierraExportFiles;
	validation: SierraBarValidationResult;
};

type SierraSyncOptions = {
	now?: () => Date;
	buildSierraBridge?: (inputs: SierraBridgeBuildInputs) => Promise<string[]>;
};

export async function runSierraSync(
	raw: RawSierraSyncInputs,
	options: SierraSyncOptions = {}
): Promise<SierraSyncResult> {
	const startedAt = Date.now();
	const normalized = normalizeSierraSyncInputs(raw, options.now);
	const generation = await loadExistingGenerationResult(
		normalized.generationInputs
	);

	await resetLatestSierraOutputs(normalized.latestOutputDir);
	await mkdir(normalized.sierraDataDir, { recursive: true });

	const sierraScidPath = join(
		normalized.sierraDataDir,
		basename(generation.files.scid)
	);

	await copyFile(generation.files.scid, sierraScidPath);

	const bridgeInstalledPath = await installSierraBridgeSource({
		acsSourceDir: normalized.acsSourceDir,
		bridgeSourcePath: normalized.bridgeSourcePath,
		latestOutputDir: normalized.latestOutputDir
	});
	const buildBridge = options.buildSierraBridge ?? buildSierraBridge;
	const bridgeDllPaths = normalized.buildSierraBridge
		? await buildBridge({
				bridgeInstalledPath,
				sierraDataDir: normalized.sierraDataDir
			})
		: [];
	const exportFiles = sierraExportFiles(generation.inputs.symbol);

	await waitForFreshSierraOutputs({
		directory: normalized.latestOutputDir,
		exportFiles,
		pollIntervalMs: normalized.exportPollIntervalMs,
		startedAt,
		timeoutMs: normalized.exportTimeoutMs
	});

	const validation = await validateSierraOneSecondBars({
		generatedFilePath: generation.files.priceLevel,
		sierraFilePath: join(normalized.latestOutputDir, exportFiles.priceLevel)
	});

	const copiedFiles = await copySierraOutputsToRun({
		exportFiles,
		fromDir: normalized.latestOutputDir,
		toDir: normalized.outputDir
	});

	return {
		bridgeDllPaths,
		bridgeInstalledPath,
		bridgeSourcePath: normalized.bridgeSourcePath,
		copiedFiles,
		exportFiles,
		generation,
		latestOutputDir: normalized.latestOutputDir,
		outputDir: normalized.outputDir,
		sierraScidPath,
		validation
	};
}
