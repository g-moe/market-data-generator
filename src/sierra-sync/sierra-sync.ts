import { exec, execFile } from 'node:child_process';
import {
	copyFile,
	mkdir,
	readFile,
	rm,
	stat,
	writeFile
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

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
const DEFAULT_DATA_OUT_TEMP_ROOT = 'data-out-temp';
const DEFAULT_SIERRA_INSTALL_DIR =
	'C:\\Trading Software\\DEV-Sierra-Chart\\Sierra Chart';
const SIERRA_BRIDGE_SOURCE_PATH = 'src-sierra-cpp/tradester_sync_bridge.cpp';
const SIERRA_BRIDGE_FILE_NAME = 'tradester_sync_bridge.cpp';
const SIERRA_BRIDGE_DLL_BASE_NAME = 'tradester_sync_bridge';
const VISUAL_STUDIO_BUILD_DIR =
	'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Auxiliary\\Build';
export const SIERRA_SYNC_REQUEST_FILE = 'tradester-sync-request.json';
export const SIERRA_SYNC_ACK_FILE = 'tradester-sync-ack.json';

const DEFAULT_RELOAD_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_INTERVAL_MS = 250;
const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export type RawSierraSyncInputs = RawGeneratorInputs & {
	dataInRoot?: string;
	dataOutRoot?: string;
	dataOutTempRoot?: string;
	sierraDataDir?: string;
	sierraInstallDir?: string;
	acsSourceDir?: string;
	bridgeSourcePath?: string;
	buildSierraBridge?: boolean;
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
	dataOutTempDir: string;
	generatedFiles: GenerationResult['files'];
	chartNames: Record<string, string>;
	exportFiles: Record<string, string>;
	useUtcTime: true;
	bridgeSourcePath: string;
	bridgeInstalledPath: string;
	bridgeDllPaths: string[];
};
export type SierraSyncAcknowledgement = {
	runId: string;
	reloadedAt: string;
	chartNumber: number;
	dataOutTempDir?: string;
	exportedFile?: string;
};
type SierraBridgeBuildInputs = {
	bridgeInstalledPath: string;
	sierraDataDir: string;
};
export type SierraSyncResult = {
	generation: GenerationResult;
	request: SierraSyncRequest;
	requestPath: string;
	acknowledgementPath: string;
	acknowledgement?: SierraSyncAcknowledgement;
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

export function createSierraSyncRequest({
	bridgeDllPaths,
	bridgeInstalledPath,
	bridgeSourcePath,
	dataOutTempDir,
	generation,
	requestedAt,
	runId
}: {
	bridgeDllPaths: string[];
	bridgeInstalledPath: string;
	bridgeSourcePath: string;
	dataOutTempDir: string;
	generation: GenerationResult;
	requestedAt: Date;
	runId: string;
}): SierraSyncRequest {
	const symbolConfig = getSymbolConfig(generation.inputs.symbol);
	return {
		bridgeDllPaths,
		bridgeInstalledPath,
		bridgeSourcePath,
		chartNames: {
			daily: `tradester_${symbolConfig.symbolId} 1 Day #5 L:1`,
			minutes5: `tradester_${symbolConfig.symbolId} 5 Min #4 L:1`,
			priceLevel: `tradester_${symbolConfig.symbolId} 1 Sec #1 L:1`,
			seconds15: `tradester_${symbolConfig.symbolId} 15 Sec #2 L:1`,
			volume500: `tradester_${symbolConfig.symbolId} 500 Volume #3 L:1`
		},
		dataOutTempDir,
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

async function buildSierraBridge({
	bridgeInstalledPath,
	sierraDataDir
}: SierraBridgeBuildInputs) {
	await mkdir(sierraDataDir, { recursive: true });
	await sendSierraMessage('RELEASE_ALL_DLLS');
	const builds = [
		{
			machine: 'ARM64' as const,
			output: join(sierraDataDir, `${SIERRA_BRIDGE_DLL_BASE_NAME}_ARM64.dll`),
			vcvars: 'vcvarsamd64_arm64.bat'
		},
		{
			machine: 'x64' as const,
			output: join(sierraDataDir, `${SIERRA_BRIDGE_DLL_BASE_NAME}_64.dll`),
			vcvars: 'vcvarsall.bat',
			vcvarsArg: 'amd64'
		}
	];
	try {
		for (const build of builds)
			await compileSierraBridge({ ...build, bridgeInstalledPath });
	} finally {
		await cleanSierraBridgeBuildArtifacts();
		await sendSierraMessage('ALLOW_LOAD_ALL_DLLS');
	}
	return builds.map((build) => build.output);
}

function normalizeSierraSyncInputs(
	raw: RawSierraSyncInputs,
	now: (() => Date) | undefined
) {
	const dataInRoot = raw.dataInRoot?.trim() || DEFAULT_DATA_IN_ROOT;
	const dataOutRoot = raw.dataOutRoot?.trim() || DEFAULT_DATA_OUT_ROOT;
	const dataOutTempRoot =
		raw.dataOutTempRoot?.trim() || DEFAULT_DATA_OUT_TEMP_ROOT;
	const requestedAt = now?.() ?? new Date();
	const syncRunId = raw.syncRunId?.trim() || createRunId(requestedAt);
	const generationInputs = normalizeInputs({ ...raw, outputDir: dataInRoot });
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
		buildSierraBridge: raw.buildSierraBridge ?? true,
		dataInRoot,
		dataOutRoot,
		dataOutTempDir: resolve(dataOutTempRoot, symbolConfig.symbolId, syncRunId),
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

async function compileSierraBridge({
	bridgeInstalledPath,
	machine,
	output,
	vcvars,
	vcvarsArg
}: {
	bridgeInstalledPath: string;
	machine: 'ARM64' | 'x64';
	output: string;
	vcvars: string;
	vcvarsArg?: string;
}) {
	const vcvarsPath = join(VISUAL_STUDIO_BUILD_DIR, vcvars);
	const vcvarsCommand =
		vcvarsArg === undefined
			? `call "${vcvarsPath}"`
			: `call "${vcvarsPath}" ${vcvarsArg}`;
	const command = `${vcvarsCommand} && cl /JMC /MP /analyze- /Zc:wchar_t /Z7 /Od /GS /W3 /RTC1 /Zc:inline /D _WINDOWS /D _USRDLL /D _WINDLL /Gd /Gy /GR- /GF /fp:precise /MTd /std:c++17 /LD /EHa /WX- /diagnostics:classic /nologo "${bridgeInstalledPath}" /link Shell32.lib Gdi32.lib User32.lib /DLL /DYNAMICBASE /DEBUG /INCREMENTAL:NO /OPT:REF /MACHINE:${machine} /OUT:"${output}" 2>&1`;
	const { stdout, stderr } = await execAsync(command, {
		maxBuffer: 1024 * 1024 * 10,
		windowsHide: true
	});
	try {
		await stat(output);
	} catch {
		throw new Error(
			`Failed to build Sierra bridge ${machine} DLL at ${output}\n${stdout}${stderr}`
		);
	}
}

async function cleanSierraBridgeBuildArtifacts() {
	await Promise.all(
		[
			'tradester_sync_bridge.exp',
			'tradester_sync_bridge.lib',
			'tradester_sync_bridge.obj'
		].map(async (artifact) => {
			await rm(artifact, { force: true });
		})
	);
}

async function sendSierraMessage(message: string) {
	const script = [
		'$client = [System.Net.Sockets.UdpClient]::new()',
		`$bytes = [Text.Encoding]::ASCII.GetBytes('${message}')`,
		'$client.Send($bytes, $bytes.Length, "127.0.0.1", 22910) | Out-Null',
		'$client.Close()'
	].join('; ');
	await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
		windowsHide: true
	});
}

async function readAcknowledgement(filePath: string) {
	try {
		await stat(filePath);
		return JSON.parse(
			await readFile(filePath, 'utf8')
		) as SierraSyncAcknowledgement;
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
			return undefined;
		throw error;
	}
}

function createRunId(date: Date) {
	return date.toISOString().replaceAll(/[:.]/g, '-');
}
function sleep(milliseconds: number) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
