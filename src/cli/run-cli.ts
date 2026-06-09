import { stdin, stdout } from 'node:process';
import { styleText } from 'node:util';
import { Worker } from 'node:worker_threads';

import { isCancel, outro, select } from '@clack/prompts';

import { SYMBOL_OPTIONS } from '../contracts/symbols.ts';
import type { GenerationResult, GeneratorInputs } from '../contracts/types.ts';
import { normalizeInputs } from '../domain/inputs.ts';

type Choice = {
	label: string;
	value: string;
};

type TaskSpinner = {
	error: (message?: string) => void;
	start: (message?: string) => void;
	stop: (message?: string) => void;
};

export type CliPorts = {
	log: (message: string) => void;
	outro: (message: string) => void;
	select: (message: string, choices: readonly Choice[]) => Promise<string>;
	spinner: () => TaskSpinner;
};

type NodePortsOptions = {
	input?: typeof stdin;
	output?: typeof stdout;
};

type RunCliOptions = {
	outputDir?: string;
	sessionCount?: number;
	ticksPerSession?: number;
};

const SYMBOL_CHOICES: Choice[] = SYMBOL_OPTIONS.map((symbol) => ({
	label: symbol.symbolId,
	value: symbol.id
}));

const SPINNER_FRAMES = ['⣾⡇', '⣽⡇', '⣻⡇', '⢿⡇', '⡿⠇', '⣟⡃', '⣯⡅', '⣷⡆'];

export async function runCli(
	ports = createNodePorts(),
	options: RunCliOptions = {}
): Promise<GenerationResult> {
	const symbol = await ports.select('Choose symbol', SYMBOL_CHOICES);
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
		const result = await generateAndWriteMarketData(inputs, (progress) => {
			const message = formatProgressMessage(progress);
			if (message !== undefined) ports.log(message);
		});
		task.stop(
			`Wrote ${result.counts.ticks} ticks to ${result.inputs.outputDir}`
		);

		return result;
	} catch (error) {
		task.error('Failed to generate market data');
		throw error;
	}
}

function formatProgressMessage(progress: {
	completed: number;
	total: number;
	sessionIndex: number;
	ticks: number;
}) {
	if (progress.completed % 100 !== 0 && progress.completed !== progress.total) {
		return undefined;
	}

	const start = Math.max(1, progress.completed - 99);

	return `Completed sessions ${start}-${progress.completed} of ${progress.total}`;
}

type WorkerMessage =
	| { result: GenerationResult }
	| {
			progress: {
				completed: number;
				total: number;
				sessionIndex: number;
				ticks: number;
			};
	  }
	| { error: { message: string; stack?: string } };

function generateAndWriteMarketData(
	inputs: GeneratorInputs,
	onProgress: (progress: {
		completed: number;
		total: number;
		sessionIndex: number;
		ticks: number;
	}) => void
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
	const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js';

	return new URL(`./generation-worker.${extension}`, import.meta.url);
}

function getGenerationWorkerExecArgv() {
	return import.meta.url.endsWith('.ts') ? ['--import', 'tsx'] : undefined;
}

function createTextSpinner(output: typeof stdout): TaskSpinner {
	let frameIndex = 0;
	let message = '';
	let timer: ReturnType<typeof setInterval> | undefined;

	const render = () => {
		const frame = styleText('white', SPINNER_FRAMES[frameIndex]);
		output.write(`\r\x1B[2K${frame}${message}`);
		frameIndex = (frameIndex + 1) % SPINNER_FRAMES.length;
	};

	const stop = (symbol: string, nextMessage = message) => {
		if (timer !== undefined) {
			clearInterval(timer);
			timer = undefined;
		}

		output.write(`\r\x1B[2K${symbol}${nextMessage}\n`);
	};

	return {
		error: (nextMessage) => {
			stop('■', nextMessage);
		},
		start: (nextMessage = '') => {
			message = nextMessage;
			render();
			timer = setInterval(render, 100);
		},
		stop: (nextMessage) => {
			stop('◇', nextMessage);
		}
	};
}

export function createNodePorts({
	input = stdin,
	output = stdout
}: NodePortsOptions = {}): CliPorts {
	return {
		log: (message) => {
			output.write(`${message}\n`);
		},
		outro: (message) => {
			outro(message, { output });
		},
		select: async (message, choices) => {
			const answer = await select({
				input,
				message,
				options: choices.map((choice) => ({
					label: choice.label,
					value: choice.value
				})),
				output
			});

			if (isCancel(answer)) {
				throw new Error('Cancelled');
			}

			return answer;
		},
		spinner: () => {
			return createTextSpinner(output);
		}
	};
}
