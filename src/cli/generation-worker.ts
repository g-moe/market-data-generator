import { parentPort, workerData } from 'node:worker_threads';

import {
	type GenerationResult,
	type GeneratorInputs,
	generateMarketData,
	writeCandlesCsv
} from '../index.ts';

type WorkerMessage =
	| { result: GenerationResult }
	| { error: { message: string; stack?: string } };

async function generateAndWrite(inputs: GeneratorInputs) {
	const result = generateMarketData(inputs);
	await writeCandlesCsv(result.filePath, result.candles);

	return result;
}

try {
	const result = await generateAndWrite(workerData as GeneratorInputs);
	parentPort?.postMessage({ result } satisfies WorkerMessage);
} catch (error) {
	parentPort?.postMessage({
		error: {
			message: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined
		}
	} satisfies WorkerMessage);
}
