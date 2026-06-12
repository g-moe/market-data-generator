import { stdout } from 'node:process';
import { Worker } from 'node:worker_threads';

import { resolveSymbolArg } from './symbol-args.ts';
import type {
	GenerationProgress,
	GenerationResult,
	GeneratorInputs
} from '../../contracts/types.ts';
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
	const message = `Generating market data for ${inputs.symbol}`;

	task.start(message);
	try {
		const result = await generateAndWriteMarketData(inputs, (progress) => {
			const message = formatProgressMessage(progress);

			if (message !== undefined) {
				ports.log(message);
			}
		});

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
	onProgress: (progress: GenerationProgress) => void
) {
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
	let message = '';
	let isRunning = false;

	const render = () => {
		if (!isRunning) return;

		output.write(`\r\x1B[2K${message}`);
	};

	const stop = (symbol: string, nextMessage = message, leadingSeparator = false) => {
		isRunning = false;

		output.write(`\r\x1B[2K${leadingSeparator ? '\n' : ''}${symbol}${nextMessage}\n`);
	};

	return {
		error: (nextMessage) => {
			stop('❌ ', nextMessage);
		},
		log: (nextMessage) => {
			output.write(`\r\x1B[2K${nextMessage}\n`);
			render();
		},
		start: (nextMessage = '') => {
			message = nextMessage;
			isRunning = true;

			render();
		},
		stop: (nextMessage) => {
			stop('✅ ', nextMessage, true);
		}
	};
}

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
