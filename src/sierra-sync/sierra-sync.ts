import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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
import { SIERRA_SYNC_REQUEST_FILE } from './constants.ts';
import {
	normalizeSierraSyncInputs,
	type RawSierraSyncInputs
} from './inputs.ts';
import { createSierraSyncRequest, type SierraSyncRequest } from './request.ts';

export type SierraSyncResult = {
	generation: GenerationResult;
	request: SierraSyncRequest;
	requestPath: string;
	bridgeSourcePath: string;
	bridgeInstalledPath: string;
	bridgeDllPaths: string[];
	outputDir: string;
	dataOutTempDir: string;
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
	const normalized = normalizeSierraSyncInputs(raw, options.now);
	const generate = options.generate ?? generateMarketData;
	const generation = await generate(normalized.generationInputs, {
		onSessionComplete: options.onSessionComplete
	});
	const bridgeInstalledPath = await installSierraBridgeSource({
		acsSourceDir: normalized.acsSourceDir,
		bridgeSourcePath: normalized.bridgeSourcePath
	});
	const buildBridge = options.buildSierraBridge ?? buildSierraBridge;
	const bridgeDllPaths = normalized.buildSierraBridge
		? await buildBridge({
				bridgeInstalledPath,
				sierraDataDir: normalized.sierraDataDir
			})
		: [];
	const request = createSierraSyncRequest({
		bridgeDllPaths,
		bridgeInstalledPath,
		bridgeSourcePath: normalized.bridgeSourcePath,
		dataOutTempDir: normalized.dataOutTempDir,
		generation,
		requestedAt: normalized.requestedAt,
		runId: normalized.syncRunId
	});
	const requestPath = join(normalized.sierraDataDir, SIERRA_SYNC_REQUEST_FILE);
	await mkdir(normalized.sierraDataDir, { recursive: true });
	await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`);
	return {
		bridgeDllPaths,
		bridgeInstalledPath,
		bridgeSourcePath: normalized.bridgeSourcePath,
		dataOutTempDir: normalized.dataOutTempDir,
		generation,
		outputDir: normalized.outputDir,
		request,
		requestPath
	};
}
