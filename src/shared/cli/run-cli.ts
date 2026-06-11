import { stdout } from 'node:process';
import { styleText } from 'node:util';
import { Worker } from 'node:worker_threads';

import { resolveSymbolArg } from './symbol-args.ts';
import type {
	GenerationProgress,
	GenerationResult,
	GeneratorInputs
} from '../../contracts/types.ts';
import { generateMarketData } from '../../md-generation/generate-market-data.ts';
import { normalizeInputs } from '../../md-generation/inputs.ts';
import { formatProgressMessage } from './progress.ts';

type TaskSpinner = {
	error: (message?: string) => void;
	start: (message?: string) => void;
	stop: (message?: string) => void;
};

type TerminalTaskSpinner = TaskSpinner & {
	log: (message: string) => void;
};

export type CliPorts = {
	log: (message: string) => void;
	spinner: () => TaskSpinner;
};

type NodePortsOptions = {
	output?: typeof stdout;
};

type RunCliOptions = {
	outputDir?: string;
	sessionCount?: number;
	ticksPerSession?: number;
	useWorker?: boolean;
};

export async function runCli(
	rawSymbol: string | undefined,
	ports = createNodePorts(),
	options: RunCliOptions = {}
): Promise<GenerationResult> {
	const symbol = resolveSymbolArg(rawSymbol);
	const inputs = normalizeInputs({
		outputDir: options.outputDir,
		sessionCount: options.sessionCount,
		symbol,
		ticksPerSession: options.ticksPerSession
	});
	const task = ports.spinner();
	const message = `Generating market data for ${inputs.symbol}...`;

	task.start(message);
	try {
		const result = await generateAndWriteMarketData(
			inputs,
			(progress) => {
				const message = formatProgressMessage(progress);

				if (message !== undefined) {
					ports.log(message);
				}
			},
			options.useWorker ?? false
		);

		task.stop(`Wrote ${result.counts.ticks} ticks to ${result.inputs.outputDir}`);

		return result;
	} catch (error) {
		task.error('Failed to generate market data');
		throw error;
	}
}

type WorkerMessage =
	| { result: GenerationResult }
	| { progress: GenerationProgress }
	| { error: { message: string; stack?: string } };

function generateAndWriteMarketData(
	inputs: GeneratorInputs,
	onProgress: (progress: GenerationProgress) => void,
	useWorker: boolean
) {
	if (!useWorker) {
		return generateMarketData(inputs, {
			onSessionComplete: onProgress
		});
	}

	return new Promise<GenerationResult>((resolve, reject) => {
		const worker = new Worker(getGenerationWorkerUrl(), {
			execArgv: getGenerationWorkerExecArgv(),
			workerData: inputs
		});

		worker.on('message', (message: WorkerMessage) => {
			if ('error' in message) {
				const error = new Error(message.error.message);
				error.stack = message.error.stack;
				reject(error);

				return;
			}

			if ('progress' in message) {
				onProgress(message.progress);

				return;
			}

			resolve(message.result);
		});
		worker.once('error', reject);
		worker.once('exit', (code) => {
			if (code !== 0) {
				reject(new Error(`Generation worker exited with code ${code}`));
			}
		});
	});
}

function getGenerationWorkerUrl() {
	return getGenerationWorkerUrlForModuleUrl(import.meta.url);
}

function getGenerationWorkerExecArgv() {
	return getGenerationWorkerExecArgvForModuleUrl(import.meta.url);
}

export function getGenerationWorkerUrlForModuleUrl(moduleUrl: string) {
	const extension = moduleUrl.endsWith('.ts') ? 'ts' : 'js';

	return new URL(`./generation-worker.${extension}`, moduleUrl);
}

export function getGenerationWorkerExecArgvForModuleUrl(moduleUrl: string) {
	return moduleUrl.endsWith('.ts') ? ['--import', 'tsx'] : undefined;
}

function createTextSpinner(output: typeof stdout): TerminalTaskSpinner {
	let frameIndex = 0;
	let message = '';
	let timer: ReturnType<typeof setInterval> | undefined;
	let isRunning = false;

	const render = () => {
		if (!isRunning) return;

		const frame = styleText('white', SPINNER_FRAMES[frameIndex]);
		output.write(`\r\x1B[2K${frame}${message}`);
		frameIndex = (frameIndex + 1) % SPINNER_FRAMES.length;
	};

	const stop = (symbol: string, nextMessage = message) => {
		if (timer !== undefined) {
			clearInterval(timer);
			timer = undefined;
		}
		isRunning = false;

		output.write(`\r\x1B[2K${symbol}${nextMessage}\n`);
	};

	return {
		error: (nextMessage) => {
			stop('[err]', nextMessage);
		},
		log: (nextMessage) => {
			output.write(`\r\x1B[2K${nextMessage}\n`);
			render();
		},
		start: (nextMessage = '') => {
			message = nextMessage;
			isRunning = true;

			render();
			timer = setInterval(render, 100);
		},
		stop: (nextMessage) => {
			stop('[ok]', nextMessage);
		}
	};
}

const SPINNER_FRAMES = ['-', '\\', '|', '/'];

export function createNodePorts({ output = stdout }: NodePortsOptions = {}): CliPorts {
	const spinner = createTextSpinner(output);

	return {
		log: (message) => {
			spinner.log(message);
		},
		spinner: () => {
			return spinner;
		}
	};
}
