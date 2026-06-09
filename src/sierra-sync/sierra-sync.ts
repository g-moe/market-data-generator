import type {
	GenerationProgress,
	GenerationResult
} from '../contracts/types.ts';
import { generateMarketData } from '../md-generation/generate-market-data.ts';
import {
	buildSierraBridge,
	installSierraBridgeSource,
	type SierraBridgeBuildInputs
} from './bridge.ts';
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

export type SierraSyncResult = {
	generation: GenerationResult;
	bridgeSourcePath: string;
	bridgeInstalledPath: string;
	bridgeDllPaths: string[];
	latestOutputDir: string;
	outputDir: string;
	exportFiles: SierraExportFiles;
	copiedFiles: SierraExportFiles;
};

type SierraSyncOptions = {
	generate?: typeof generateMarketData;
	onSessionComplete?: (progress: GenerationProgress) => void;
	now?: () => Date;
	buildSierraBridge?: (inputs: SierraBridgeBuildInputs) => Promise<string[]>;
};

export async function runSierraSync(
	raw: RawSierraSyncInputs,
	options: SierraSyncOptions = {}
): Promise<SierraSyncResult> {
	const startedAt = Date.now();
	const normalized = normalizeSierraSyncInputs(raw, options.now);
	const generate = options.generate ?? generateMarketData;
	const generation = await generate(normalized.generationInputs, {
		onSessionComplete: options.onSessionComplete
	});
	await resetLatestSierraOutputs(normalized.latestOutputDir);
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
		startedAt
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
		outputDir: normalized.outputDir
	};
}
