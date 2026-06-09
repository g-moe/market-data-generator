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
import { generateMarketData } from '../src/domain/generate-market-data.ts';

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

const iterationsArg = process.argv.find((arg) =>
	arg.startsWith('--iterations=')
);
const iterations =
	iterationsArg === undefined ? 1 : Number(iterationsArg.split('=')[1]);
if (!Number.isInteger(iterations) || iterations < 1) {
	throw new Error('--iterations must be a positive integer');
}
const sampleMemory = !process.argv.includes('--no-memory-sampling');
const isolated = process.argv.includes('--isolated');
const scenarioArg = process.argv.find((arg) => arg.startsWith('--scenario='));
const scenarioName =
	scenarioArg === undefined ? undefined : scenarioArg.split('=')[1];

const selectedScenarios =
	scenarioName === undefined
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
	for (const result of results) console.log(JSON.stringify(result));
	if (results.length > 1) console.log(JSON.stringify(summarize(results)));
}

async function runIsolatedScenarios(scenarios: Scenario[]) {
	const scriptPath = fileURLToPath(import.meta.url);
	for (const scenario of scenarios) {
		await new Promise<void>((resolve, reject) => {
			const args = [
				...process.execArgv,
				scriptPath,
				`--iterations=${iterations}`,
				`--scenario=${scenario.name}`
			];
			if (!sampleMemory) args.push('--no-memory-sampling');
			if (process.argv.includes('--keep-output')) args.push('--keep-output');
			const child = spawn(process.execPath, args, {
				stdio: ['ignore', 'inherit', 'inherit']
			});
			child.on('error', reject);
			child.on('exit', (code) => {
				if (code === 0) resolve();
				else reject(new Error(`${scenario.name} exited with code ${code}`));
			});
		});
	}
}

async function runScenario(
	scenario: Scenario,
	options: { iteration?: number; keepOutput: boolean; warmup: boolean }
) {
	if (globalThis.gc) globalThis.gc();
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
	const generation = await generateMarketData(inputs, {
		onSessionComplete: sampleMemory
			? () => {
					const memory = process.memoryUsage();
					peakHeapUsed = Math.max(peakHeapUsed ?? 0, memory.heapUsed);
					peakRss = Math.max(peakRss ?? 0, memory.rss);
				}
			: undefined
	});
	const elapsedMs = performance.now() - start;
	if (globalThis.gc) globalThis.gc();
	const endMemory = process.memoryUsage();
	const output = await fingerprintDirectory(outputDir);

	if (!options.keepOutput) {
		await rm(outputRoot, { force: true, recursive: true });
	}

	return {
		elapsedMs: Math.round(elapsedMs),
		hash: output.hash,
		heapUsedDeltaMb: toMb(endMemory.heapUsed - startMemory.heapUsed),
		heapUsedMb: toMb(endMemory.heapUsed),
		heapUsedPeakMb: peakHeapUsed === undefined ? undefined : toMb(peakHeapUsed),
		iteration: options.iteration,
		name: scenario.name,
		outputBytes: output.bytes,
		outputRoot: options.keepOutput ? outputRoot : undefined,
		rssDeltaMb: toMb(endMemory.rss - startMemory.rss),
		rssMb: toMb(endMemory.rss),
		rssPeakMb: peakRss === undefined ? undefined : toMb(peakRss),
		ticks: generation.counts.ticks,
		ticksPerSecond: Math.round(generation.counts.ticks / (elapsedMs / 1000)),
		warmup: options.warmup || undefined
	};
}

function summarize(results: ScenarioResult[]) {
	const elapsed = results.map((result) => result.elapsedMs);
	const heapPeak = results
		.map((result) => result.heapUsedPeakMb)
		.filter((value) => value !== undefined);
	const peakRss = results
		.map((result) => result.rssPeakMb)
		.filter((value) => value !== undefined);
	const throughput = results.map((result) => result.ticksPerSecond);
	const rss = results.map((result) => result.rssMb);

	return {
		elapsedMsMax: Math.max(...elapsed),
		elapsedMsMedian: median(elapsed),
		elapsedMsMin: Math.min(...elapsed),
		hashes: [...new Set(results.map((result) => result.hash))],
		heapUsedPeakMbMax:
			heapPeak.length === 0 ? undefined : Math.max(...heapPeak),
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
	let bytes = 0;
	for (const file of (await readdir(directory)).sort()) {
		const path = join(directory, file);
		const fileStat = await stat(path);
		bytes += fileStat.size;
		hash.update(file);
		await updateHashFromFile(hash, path);
	}

	return { bytes, hash: hash.digest('hex') };
}

async function updateHashFromFile(
	hash: ReturnType<typeof createHash>,
	path: string
) {
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
	if (sorted.length % 2 === 1) return sorted[middle];

	return Math.round(((sorted[middle - 1] + sorted[middle]) / 2) * 10) / 10;
}
