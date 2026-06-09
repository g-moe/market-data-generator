import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { styleText } from 'node:util';
import { Worker } from 'node:worker_threads';

import { SYMBOL_OPTIONS } from '../../contracts/symbols.ts';
import type {
	GenerationProgress,
	GenerationResult,
	GeneratorInputs
} from '../../contracts/types.ts';
import { normalizeInputs } from '../../md-generation/inputs.ts';
import { formatProgressMessage } from './progress.ts';

type Choice = {
	description?: string;
	label: string;
	value: string;
};

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
	prompt: (message: string) => Promise<string>;
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
	description: `${symbol.name} (${symbol.id})`,
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

			if (message !== undefined) {
				ports.log(message);
			}
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
	const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js';

	return new URL(`./generation-worker.${extension}`, import.meta.url);
}

function getGenerationWorkerExecArgv() {
	return import.meta.url.endsWith('.ts') ? ['--import', 'tsx'] : undefined;
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
			stop('■', nextMessage);
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
			stop('◇', nextMessage);
		}
	};
}

export function createNodePorts({
	input = stdin,
	output = stdout
}: NodePortsOptions = {}): CliPorts {
	const spinner = createTextSpinner(output);

	return {
		log: (message) => {
			spinner.log(message);
		},
		prompt: async (message) => {
			const prompt = createInterface({
				input,
				output,
				terminal: output.isTTY
			});

			try {
				const answer = await prompt.question(`${message}: `);

				return answer.trim();
			} finally {
				prompt.close();
			}
		},
		select: async (message, choices) => {
			const prompt = createInterface({
				input,
				output,
				terminal: output.isTTY
			});

			try {
				output.write(`${message}\n`);
				choices.forEach((choice, index) => {
					output.write(formatChoiceLine(choice, index));
				});

				const lines = prompt[Symbol.asyncIterator]();
				while (true) {
					output.write('Enter choice: ');

					const line = await lines.next();
					if (line.done === true) {
						throw new Error('No symbol selected');
					}

					const answer = line.value.trim();
					const choice = findChoice(answer, choices);

					if (choice !== undefined) {
						return choice.value;
					}

					output.write('Invalid choice. Try again.\n');
				}
			} finally {
				prompt.close();
			}
		},
		spinner: () => {
			return spinner;
		}
	};
}

function formatChoiceLine(choice: Choice, index: number) {
	const description =
		choice.description === undefined ? '' : `  ${choice.description}`;

	return `${index + 1}. ${choice.label}${description}\n`;
}

function findChoice(answer: string, choices: readonly Choice[]) {
	const choiceIndex = Number(answer) - 1;
	if (Number.isInteger(choiceIndex) && choices[choiceIndex] !== undefined) {
		return choices[choiceIndex];
	}

	const normalizedAnswer = answer.toUpperCase();

	return choices.find((option) => {
		return (
			option.value.toUpperCase() === normalizedAnswer ||
			option.label.toUpperCase() === normalizedAnswer
		);
	});
}
