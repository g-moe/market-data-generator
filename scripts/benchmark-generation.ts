import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import { DEFAULT_ANCHOR_ISO, DEFAULT_SEED } from '../src/contracts/defaults.ts';
import type { GeneratorInputs } from '../src/contracts/types.ts';
import { generateMarketData } from '../src/domain/generate-market-data.ts';

type Scenario = {
	name: string;
	inputs: Omit<GeneratorInputs, 'outputDir' | 'outputRoot'>;
};

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
	}
];

const warmupScenario = SCENARIOS[0];
await runScenario(warmupScenario, { keepOutput: false, warmup: true });

for (const scenario of SCENARIOS) {
	const result = await runScenario(scenario, {
		keepOutput: process.argv.includes('--keep-output'),
		warmup: false
	});
	console.log(JSON.stringify(result));
}

async function runScenario(
	scenario: Scenario,
	options: { keepOutput: boolean; warmup: boolean }
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
	const start = performance.now();
	const generation = await generateMarketData(inputs);
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
		name: scenario.name,
		outputBytes: output.bytes,
		outputRoot: options.keepOutput ? outputRoot : undefined,
		rssDeltaMb: toMb(endMemory.rss - startMemory.rss),
		rssMb: toMb(endMemory.rss),
		ticks: generation.counts.ticks,
		ticksPerSecond: Math.round(generation.counts.ticks / (elapsedMs / 1000)),
		warmup: options.warmup || undefined
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
		hash.update(await readFile(path));
	}

	return { bytes, hash: hash.digest('hex') };
}

function toMb(bytes: number) {
	return Math.round((bytes / 1024 / 1024) * 10) / 10;
}
