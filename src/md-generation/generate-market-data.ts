import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { createTimeframeRecord } from '../contracts/timeframes.ts';
import { getSymbolConfig } from '../contracts/symbols.ts';
import type {
	GenerationProgress,
	GenerationResult,
	GeneratorInputs,
	OutputFiles,
	OutputMetadata
} from '../contracts/types.ts';
import { getOutputFiles as buildOutputFiles } from '../shared/output-files.ts';
import {
	getPreviousSessionStart,
	getSessionStart,
	isTradingSessionStart
} from './shared/market-time.ts';
import { createMarketDataPipeline } from './pipeline/market-data-pipeline.ts';
import type { GenerationSession, PipelineSummary } from './pipeline/generation-pipeline.ts';
import { TickStream } from './tick-engine/tick-stream.ts';
import { getSessionOpenPrice } from './tick-engine/session-ticks.ts';
import { UNIX_EPOCH_MS } from './shared/market-time-constants.ts';
import { writeAlignedScids } from './scid-output.ts';

type GenerateMarketDataOptions = {
	onSessionComplete?: (progress: GenerationProgress) => void;
};

export async function generateMarketData(
	inputs: GeneratorInputs,
	options: GenerateMarketDataOptions = {}
): Promise<GenerationResult> {
	const symbolConfig = getSymbolConfig(inputs.symbol);
	const files = getOutputFiles(inputs);
	const sessions = getGenerationSessions(inputs);
	const pipeline = createMarketDataPipeline({
		files,
		inputs,
		sessionStarts: sessions,
		symbolConfig
	});
	const ticks = new TickStream(inputs, symbolConfig);
	let tickCount = 0;
	let previousClose = inputs.startPrice;

	await pipeline.open();

	try {
		for (const session of sessions) {
			await pipeline.startSession(session);

			let sessionTicks = 0;
			if (session.generated) {
				const sessionOpenPrice = getSessionOpenPrice(
					previousClose,
					inputs,
					symbolConfig,
					session.index
				);

				previousClose = ticks.generateSession(session, sessionOpenPrice, pipeline);
				sessionTicks = inputs.ticksPerSession;
				tickCount += sessionTicks;
			}

			await pipeline.finalizeSession(session);

			options.onSessionComplete?.({
				completed: session.index + 1,
				sessionIndex: session.index,
				ticks: sessionTicks,
				total: inputs.sessionCount
			});
		}

		await pipeline.finish();

		const summary = pipeline.summary();
		const metadata = createOutputMetadata(summary);

		await writeAlignedScids({
			metadata,
			scids: files.scids,
			sessions,
			ticksPerSession: inputs.ticksPerSession
		});
		await writeOutputMetadata(files.metadata, metadata);

		return {
			counts: {
				orderbook: summary.orderbook,
				ticks: tickCount,
				timeframes: createTimeframeRecord((key) => getTimeframeSummary(summary, key).count)
			},
			files,
			inputs
		};
	} finally {
		await pipeline.close();
	}
}

export function getOutputFiles(inputs: GeneratorInputs): OutputFiles {
	return buildOutputFiles(inputs.symbol, inputs.outputDir);
}

function getGenerationSessions(inputs: GeneratorInputs): GenerationSession[] {
	const starts: number[] = [];
	let cursor = getSessionStart(inputs.anchorIso, 0);

	while (starts.length < inputs.sessionCount) {
		if (isTradingSessionStart(cursor)) {
			starts.push(cursor);
		}

		cursor = getPreviousSessionStart(cursor);
	}

	return starts.reverse().map((start, index) => ({
		generated: start >= UNIX_EPOCH_MS,
		index,
		start
	}));
}

function createOutputMetadata(summary: PipelineSummary): OutputMetadata {
	return {
		timeframes: createTimeframeRecord((key) => getTimeframeSummary(summary, key).range)
	};
}

function getTimeframeSummary(summary: PipelineSummary, key: keyof PipelineSummary['timeframes']) {
	const timeframeSummary = summary.timeframes[key];
	if (timeframeSummary === undefined) {
		throw new Error(`Missing summary for timeframe: ${key}`);
	}

	return timeframeSummary;
}

async function writeOutputMetadata(filePath: string, metadata: OutputMetadata) {
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, `${JSON.stringify(metadata, null, '\t')}\n`);
}
