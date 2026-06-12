import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { DEFAULT_ANCHOR_ISO, DEFAULT_SEED } from '../src/contracts/defaults.ts';
import type { GeneratorInputs } from '../src/contracts/types.ts';
import { generateMarketData } from '../src/md-generation/generate-market-data.ts';
import { findSymbol, getSymbolConfig } from '../src/contracts/symbols.ts';

type Scenario = {
	name: string;
	inputs: Omit<GeneratorInputs, 'outputDir' | 'outputRoot'>;
};

type ScenarioResult = Awaited<ReturnType<typeof runScenario>>;

const SCENARIOS: Scenario[] = [
	{
		inputs: {
			anchorIso: DEFAULT_ANCHOR_ISO,
			seed: DEFAULT_SEED,
			sessionCount: 100,
			startPrice: 6000,
			symbol: '/ES:XCME',
			ticksPerSession: 10_000
		},
		name: 'es-1m-ticks'
	},
	{
		inputs: {
			anchorIso: DEFAULT_ANCHOR_ISO,
			seed: 7,
			sessionCount: 200,
			startPrice: 22_000,
			symbol: '/NQ:XCME',
			ticksPerSession: 10_000
		},
		name: 'nq-2m-ticks'
	},
	{
		inputs: {
			anchorIso: DEFAULT_ANCHOR_ISO,
			seed: 11,
			sessionCount: 500,
			startPrice: 6000,
			symbol: '/ES:XCME',
			ticksPerSession: 10_000
		},
		name: 'es-5m-ticks'
	}
];

const iterationsArg = process.argv.find((arg) => arg.startsWith('--iterations='));
const iterations = iterationsArg === undefined ? 1 : Number(iterationsArg.split('=')[1]);
if (!Number.isInteger(iterations) || iterations < 1) {
	throw new Error('--iterations must be a positive integer');
}

const sampleMemory = !process.argv.includes('--no-memory-sampling');
const isolated = process.argv.includes('--isolated');
const skipFingerprint = process.argv.includes('--skip-fingerprint');
const scenarioArg = process.argv.find((arg) => arg.startsWith('--scenario='));
const scenarioName = scenarioArg === undefined ? undefined : scenarioArg.split('=')[1];
const sessionCountArg = process.argv.find((arg) => arg.startsWith('--session-count='));
const ticksPerSessionArg = process.argv.find((arg) => arg.startsWith('--ticks-per-session='));
const symbolArg = process.argv.find((arg) => arg.startsWith('--symbol='));
const progressWindowArg = process.argv.find((arg) => arg.startsWith('--progress-window='));
const progressWindow =
	progressWindowArg === undefined ? undefined : Number(progressWindowArg.split('=')[1]);
if (progressWindow !== undefined && (!Number.isInteger(progressWindow) || progressWindow < 1)) {
	throw new Error('--progress-window must be a positive integer');
}

const customScenario = createCustomScenario({
	sessionCountArg,
	symbolArg,
	ticksPerSessionArg
});

const selectedScenarios =
	customScenario !== undefined
		? [customScenario]
		: scenarioName === undefined
			? SCENARIOS
			: SCENARIOS.filter((scenario) => scenario.name === scenarioName);
if (selectedScenarios.length === 0) {
	throw new Error(`Unknown scenario: ${scenarioName}`);
}

if (isolated) {
	await runIsolatedScenarios(selectedScenarios);
	process.exit(0);
}

const warmupScenario = selectedScenarios[0];
await runScenario(warmupScenario, { keepOutput: false, warmup: true });

for (const scenario of selectedScenarios) {
	const results: ScenarioResult[] = [];
	for (let iteration = 0; iteration < iterations; iteration++) {
		results.push(
			await runScenario(scenario, {
				iteration,
				keepOutput: process.argv.includes('--keep-output'),
				warmup: false
			})
		);
	}

	for (const result of results) {
		console.log(JSON.stringify(result));
	}

	if (results.length > 1) {
		console.log(JSON.stringify(summarize(results)));
	}
}

async function runIsolatedScenarios(scenarios: Scenario[]) {
	const scriptPath = fileURLToPath(import.meta.url);
	for (const scenario of scenarios) {
		await new Promise<void>((resolve, reject) => {
			const args = [...process.execArgv, scriptPath, `--iterations=${iterations}`];

			if (customScenario === undefined) {
				args.push(`--scenario=${scenario.name}`);
			} else {
				args.push(
					`--session-count=${scenario.inputs.sessionCount}`,
					`--symbol=${scenario.inputs.symbol}`,
					`--ticks-per-session=${scenario.inputs.ticksPerSession}`
				);
			}

			if (!sampleMemory) {
				args.push('--no-memory-sampling');
			}

			if (progressWindow !== undefined) {
				args.push(`--progress-window=${progressWindow}`);
			}

			if (process.argv.includes('--keep-output')) {
				args.push('--keep-output');
			}

			if (skipFingerprint) {
				args.push('--skip-fingerprint');
			}

			const child = spawn(process.execPath, args, {
				stdio: ['ignore', 'inherit', 'inherit']
			});

			child.on('error', reject);
			child.on('exit', (code) => {
				if (code === 0) {
					resolve();

					return;
				}

				reject(new Error(`${scenario.name} exited with code ${code}`));
			});
		});
	}
}

async function runScenario(
	scenario: Scenario,
	options: { iteration?: number; keepOutput: boolean; warmup: boolean }
) {
	if (globalThis.gc) {
		globalThis.gc();
	}

	const outputRoot = await mkdtemp(join(tmpdir(), 'mdg-bench-'));
	const outputDir = join(outputRoot, scenario.name);
	const inputs: GeneratorInputs = {
		...scenario.inputs,
		outputDir,
		outputRoot
	};

	const startMemory = process.memoryUsage();
	let peakHeapUsed = sampleMemory ? startMemory.heapUsed : undefined;
	let peakRss = sampleMemory ? startMemory.rss : undefined;
	const start = performance.now();
	let lastWindowCompleted = 0;
	let lastWindowTime = start;
	const sessionWindows: Array<{
		elapsedMs: number;
		sessionEnd: number;
		sessionStart: number;
		ticksPerSecond: number;
	}> = [];
	const generation = await generateMarketData(inputs, {
		onSessionComplete:
			sampleMemory || progressWindow !== undefined
				? (progress) => {
						const memory = process.memoryUsage();
						if (sampleMemory) {
							peakHeapUsed = Math.max(peakHeapUsed ?? 0, memory.heapUsed);
							peakRss = Math.max(peakRss ?? 0, memory.rss);
						}

						if (
							progressWindow === undefined ||
							(progress.completed % progressWindow !== 0 && progress.completed !== progress.total)
						) {
							return;
						}

						const now = performance.now();
						const windowSessions = progress.completed - lastWindowCompleted;
						sessionWindows.push({
							elapsedMs: Math.round(now - lastWindowTime),
							sessionEnd: progress.completed,
							sessionStart: lastWindowCompleted + 1,
							ticksPerSecond: Math.round(
								(windowSessions * scenario.inputs.ticksPerSession) / ((now - lastWindowTime) / 1000)
							)
						});
						lastWindowCompleted = progress.completed;
						lastWindowTime = now;
					}
				: undefined
	});
	const elapsedMs = performance.now() - start;

	if (globalThis.gc) {
		globalThis.gc();
	}

	const endMemory = process.memoryUsage();
	const output = skipFingerprint ? undefined : await fingerprintDirectory(outputDir);

	if (!options.keepOutput) {
		await rm(outputRoot, { force: true, recursive: true });
	}

	return {
		elapsedMs: Math.round(elapsedMs),
		hash: output?.hash,
		heapUsedDeltaMb: toMb(endMemory.heapUsed - startMemory.heapUsed),
		heapUsedMb: toMb(endMemory.heapUsed),
		heapUsedPeakMb: peakHeapUsed === undefined ? undefined : toMb(peakHeapUsed),
		iteration: options.iteration,
		name: scenario.name,
		outputBytes: output?.bytes,
		outputRoot: options.keepOutput ? outputRoot : undefined,
		rssDeltaMb: toMb(endMemory.rss - startMemory.rss),
		rssMb: toMb(endMemory.rss),
		rssPeakMb: peakRss === undefined ? undefined : toMb(peakRss),
		sessionWindows: sessionWindows.length === 0 ? undefined : sessionWindows,
		ticks: generation.counts.ticks,
		ticksPerSecond: Math.round(generation.counts.ticks / (elapsedMs / 1000)),
		warmup: options.warmup || undefined
	};
}

function createCustomScenario({
	sessionCountArg,
	symbolArg,
	ticksPerSessionArg
}: {
	sessionCountArg: string | undefined;
	symbolArg: string | undefined;
	ticksPerSessionArg: string | undefined;
}): Scenario | undefined {
	if (
		sessionCountArg === undefined &&
		ticksPerSessionArg === undefined &&
		symbolArg === undefined
	) {
		return undefined;
	}

	const sessionCount = sessionCountArg === undefined ? 500 : Number(sessionCountArg.split('=')[1]);
	const ticksPerSession =
		ticksPerSessionArg === undefined ? 10_000 : Number(ticksPerSessionArg.split('=')[1]);
	const symbol = findSymbol(symbolArg?.split('=')[1] ?? 'ES');
	if (symbol === undefined) {
		throw new Error('--symbol must be ES or NQ');
	}

	if (!Number.isInteger(sessionCount) || sessionCount < 1) {
		throw new Error('--session-count must be a positive integer');
	}

	if (!Number.isInteger(ticksPerSession) || ticksPerSession < 1) {
		throw new Error('--ticks-per-session must be a positive integer');
	}

	const symbolConfig = getSymbolConfig(symbol);

	return {
		inputs: {
			anchorIso: DEFAULT_ANCHOR_ISO,
			seed: DEFAULT_SEED,
			sessionCount,
			startPrice: symbolConfig.defaultStartPrice,
			symbol,
			ticksPerSession
		},
		name: `${symbolConfig.symbolId.toLowerCase()}-${sessionCount}s-${ticksPerSession}t`
	};
}

function summarize(results: ScenarioResult[]) {
	const elapsed = results.map((result) => result.elapsedMs);
	const heapPeak = results
		.map((result) => result.heapUsedPeakMb)
		.filter((value) => value !== undefined);
	const peakRss = results.map((result) => result.rssPeakMb).filter((value) => value !== undefined);
	const throughput = results.map((result) => result.ticksPerSecond);
	const rss = results.map((result) => result.rssMb);

	return {
		elapsedMsMax: Math.max(...elapsed),
		elapsedMsMedian: median(elapsed),
		elapsedMsMin: Math.min(...elapsed),
		hashes: [...new Set(results.map((result) => result.hash))],
		heapUsedPeakMbMax: heapPeak.length === 0 ? undefined : Math.max(...heapPeak),
		heapUsedPeakMbMedian: heapPeak.length === 0 ? undefined : median(heapPeak),
		iterations: results.length,
		name: `${results[0].name}-summary`,
		rssMbMax: Math.max(...rss),
		rssMbPeakMax: peakRss.length === 0 ? undefined : Math.max(...peakRss),
		rssMbPeakMedian: peakRss.length === 0 ? undefined : median(peakRss),
		ticksPerSecondMedian: median(throughput)
	};
}

async function fingerprintDirectory(directory: string) {
	const hash = createHash('sha256');
	const bytes = await updateHashFromDirectory(hash, directory, '');

	return { bytes, hash: hash.digest('hex') };
}

async function updateHashFromDirectory(
	hash: ReturnType<typeof createHash>,
	directory: string,
	relativeDirectory: string
) {
	let bytes = 0;

	for (const file of (await readdir(directory)).sort()) {
		const relativePath = relativeDirectory === '' ? file : join(relativeDirectory, file);
		const path = join(directory, file);
		const fileStat = await stat(path);

		if (fileStat.isDirectory()) {
			bytes += await updateHashFromDirectory(hash, path, relativePath);

			continue;
		}

		bytes += fileStat.size;
		hash.update(relativePath);
		await updateHashFromFile(hash, path);
	}

	return bytes;
}

async function updateHashFromFile(hash: ReturnType<typeof createHash>, path: string) {
	for await (const chunk of createReadStream(path)) {
		hash.update(chunk);
	}
}

function toMb(bytes: number) {
	return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

function median(values: number[]) {
	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);

	if (sorted.length % 2 === 1) {
		return sorted[middle];
	}

	return Math.round(((sorted[middle - 1] + sorted[middle]) / 2) * 10) / 10;
}
