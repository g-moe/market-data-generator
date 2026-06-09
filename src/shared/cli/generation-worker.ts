import { parentPort, workerData } from 'node:worker_threads';

import type {
	GenerationProgress,
	GenerationResult,
	GeneratorInputs
} from '../../contracts/types.ts';
import { generateMarketData } from '../../md-generation/generate-market-data.ts';

type WorkerMessage =
	| { result: GenerationResult }
	| { progress: GenerationProgress }
	| { error: { message: string; stack?: string } };

try {
	const result = await generateMarketData(workerData as GeneratorInputs, {
		onSessionComplete: (progress) => {
			parentPort?.postMessage({ progress } satisfies WorkerMessage);
		}
	});
	parentPort?.postMessage({ result } satisfies WorkerMessage);
} catch (error) {
	parentPort?.postMessage({
		error: {
			message: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined
		}
	} satisfies WorkerMessage);
}
