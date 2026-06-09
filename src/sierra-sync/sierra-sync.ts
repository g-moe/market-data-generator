import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { getSymbolConfig } from '../contracts/symbols.ts';
import type {
	GenerationProgress,
	GenerationResult,
	RawGeneratorInputs
} from '../contracts/types.ts';
import { generateMarketData } from '../md-generation/generate-market-data.ts';
import { normalizeInputs } from '../md-generation/inputs.ts';

const DEFAULT_DATA_IN_ROOT = 'data-in';
const DEFAULT_DATA_OUT_ROOT = 'data-out';
const DEFAULT_SIERRA_INSTALL_DIR =
	'C:\\Trading Software\\DEV-Sierra-Chart\\Sierra Chart';
const SIERRA_BRIDGE_SOURCE_PATH = 'src-sierra-cpp/tradester_sync_bridge.cpp';
const SIERRA_BRIDGE_FILE_NAME = 'tradester_sync_bridge.cpp';
export const SIERRA_SYNC_REQUEST_FILE = 'tradester-sync-request.json';
export const SIERRA_SYNC_ACK_FILE = 'tradester-sync-ack.json';

const DEFAULT_RELOAD_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_INTERVAL_MS = 250;

export type RawSierraSyncInputs = RawGeneratorInputs & {
	dataInRoot?: string;
	dataOutRoot?: string;
	sierraDataDir?: string;
	sierraInstallDir?: string;
	acsSourceDir?: string;
	bridgeSourcePath?: string;
	syncRunId?: string;
	waitForAcknowledgement?: boolean;
	reloadTimeoutMs?: number;
	pollIntervalMs?: number;
};

export type SierraSyncRequest = {
	runId: string;
	requestedAt: string;
	symbol: string;
	symbolId: string;
	generatedFiles: GenerationResult['files'];
	chartNames: Record<string, string>;
	exportFiles: Record<string, string>;
	useUtcTime: true;
	bridgeSourcePath: string;
	bridgeInstalledPath: string;
};

export type SierraSyncAcknowledgement = {
	runId: string;
	reloadedAt: string;
	exportedFiles?: Record<string, string>;
};

export type SierraSyncResult = {
	generation: GenerationResult;
	request: SierraSyncRequest;
	requestPath: string;
	acknowledgementPath: string;
	acknowledgement?: SierraSyncAcknowledgement;
	bridgeSourcePath: string;
	bridgeInstalledPath: string;
	outputDir: string;
};

type SierraSyncOptions = {
	generate?: typeof generateMarketData;
	onSessionComplete?: (progress: GenerationProgress) => void;
	now?: () => Date;
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
	const request = createSierraSyncRequest({
		bridgeInstalledPath,
		bridgeSourcePath: normalized.bridgeSourcePath,
		generation,
		requestedAt: normalized.requestedAt,
		runId: normalized.syncRunId
	});
	const requestPath = join(normalized.sierraDataDir, SIERRA_SYNC_REQUEST_FILE);
	const acknowledgementPath = join(
		normalized.sierraDataDir,
		SIERRA_SYNC_ACK_FILE
	);

	await mkdir(normalized.sierraDataDir, { recursive: true });
	await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`);

	const acknowledgement = normalized.waitForAcknowledgement
		? await waitForSierraAcknowledgement({
				acknowledgementPath,
				pollIntervalMs: normalized.pollIntervalMs,
				runId: normalized.syncRunId,
				timeoutMs: normalized.reloadTimeoutMs
			})
		: undefined;

	return {
		acknowledgement,
		acknowledgementPath,
		bridgeInstalledPath,
		bridgeSourcePath: normalized.bridgeSourcePath,
		generation,
		outputDir: normalized.outputDir,
		request,
		requestPath
	};
}

export function createSierraSyncRequest({
	bridgeInstalledPath,
	bridgeSourcePath,
	generation,
	requestedAt,
	runId
}: {
	bridgeInstalledPath: string;
	bridgeSourcePath: string;
	generation: GenerationResult;
	requestedAt: Date;
	runId: string;
}): SierraSyncRequest {
	const symbolConfig = getSymbolConfig(generation.inputs.symbol);

	return {
		bridgeInstalledPath,
		bridgeSourcePath,
		chartNames: {
			daily: `tradester_${symbolConfig.symbolId} 1 Day #5 L:1`,
			minutes5: `tradester_${symbolConfig.symbolId} 5 Min #4 L:1`,
			priceLevel: `tradester_${symbolConfig.symbolId} 1 Sec #1 L:1`,
			seconds15: `tradester_${symbolConfig.symbolId} 15 Sec #2 L:1`,
			volume500: `tradester_${symbolConfig.symbolId} 500 Volume #3 L:1`
		},
		exportFiles: {
			daily: `tradester_${symbolConfig.symbolId}_1d_GraphData.txt`,
			minutes5: `tradester_${symbolConfig.symbolId}_5m_GraphData.txt`,
			priceLevel: `tradester_${symbolConfig.symbolId}_1s_GraphData.txt`,
			seconds15: `tradester_${symbolConfig.symbolId}_15s_GraphData.txt`,
			volume500: `tradester_${symbolConfig.symbolId}_500v_GraphData.txt`
		},
		generatedFiles: generation.files,
		requestedAt: requestedAt.toISOString(),
		runId,
		symbol: generation.inputs.symbol,
		symbolId: symbolConfig.symbolId,
		useUtcTime: true
	};
}

export async function waitForSierraAcknowledgement({
	acknowledgementPath,
	pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
	runId,
	timeoutMs = DEFAULT_RELOAD_TIMEOUT_MS
}: {
	acknowledgementPath: string;
	pollIntervalMs?: number;
	runId: string;
	timeoutMs?: number;
}): Promise<SierraSyncAcknowledgement> {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() <= deadline) {
		const acknowledgement = await readAcknowledgement(acknowledgementPath);
		if (acknowledgement?.runId === runId) return acknowledgement;

		await sleep(pollIntervalMs);
	}

	throw new Error(
		`Timed out waiting for Sierra acknowledgement ${acknowledgementPath} for run ${runId}`
	);
}

function normalizeSierraSyncInputs(
	raw: RawSierraSyncInputs,
	now: (() => Date) | undefined
) {
	const dataInRoot = raw.dataInRoot?.trim() || DEFAULT_DATA_IN_ROOT;
	const dataOutRoot = raw.dataOutRoot?.trim() || DEFAULT_DATA_OUT_ROOT;
	const requestedAt = now?.() ?? new Date();
	const syncRunId = raw.syncRunId?.trim() || createRunId(requestedAt);
	const generationInputs = normalizeInputs({
		...raw,
		outputDir: dataInRoot
	});
	const symbolConfig = getSymbolConfig(generationInputs.symbol);
	const sierraInstallDir =
		raw.sierraInstallDir?.trim() || DEFAULT_SIERRA_INSTALL_DIR;
	const sierraDataDir =
		raw.sierraDataDir?.trim() || join(sierraInstallDir, 'Data');
	const acsSourceDir =
		raw.acsSourceDir?.trim() || join(sierraInstallDir, 'ACS_Source');

	return {
		acsSourceDir,
		bridgeSourcePath: raw.bridgeSourcePath?.trim() || SIERRA_BRIDGE_SOURCE_PATH,
		dataInRoot,
		dataOutRoot,
		generationInputs,
		outputDir: join(dataOutRoot, symbolConfig.symbolId, syncRunId),
		pollIntervalMs: raw.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
		reloadTimeoutMs: raw.reloadTimeoutMs ?? DEFAULT_RELOAD_TIMEOUT_MS,
		requestedAt,
		sierraDataDir,
		syncRunId,
		waitForAcknowledgement: raw.waitForAcknowledgement ?? false
	};
}

async function installSierraBridgeSource({
	acsSourceDir,
	bridgeSourcePath
}: {
	acsSourceDir: string;
	bridgeSourcePath: string;
}) {
	const bridgeInstalledPath = join(acsSourceDir, SIERRA_BRIDGE_FILE_NAME);

	await mkdir(acsSourceDir, { recursive: true });
	await copyFile(bridgeSourcePath, bridgeInstalledPath);

	return bridgeInstalledPath;
}

async function readAcknowledgement(filePath: string) {
	try {
		await stat(filePath);
		return JSON.parse(
			await readFile(filePath, 'utf8')
		) as SierraSyncAcknowledgement;
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
			return undefined;
		}

		throw error;
	}
}

function createRunId(date: Date) {
	return date.toISOString().replaceAll(/[:.]/g, '-');
}

function sleep(milliseconds: number) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
