import { stdin, stdout } from 'node:process';
import { styleText } from 'node:util';
import { Worker } from 'node:worker_threads';

import { isCancel, outro, select, text } from '@clack/prompts';

import {
	type CandleType,
	type GenerationResult,
	type GeneratorInputs,
	normalizeInputs,
	SYMBOL_OPTIONS
} from '../index.ts';

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
	outro: (message: string) => void;
	select: (message: string, choices: readonly Choice[]) => Promise<string>;
	spinner: () => TaskSpinner;
	text: (
		message: string,
		validate?: (value: string | undefined) => string | undefined
	) => Promise<string>;
};

type NodePortsOptions = {
	input?: typeof stdin;
	output?: typeof stdout;
};

const CANDLE_TYPE_OPTIONS: Choice[] = [
	{ label: 'minute', value: 'minute' },
	{ label: 'daily', value: 'daily' }
];

const SYMBOL_CHOICES: Choice[] = SYMBOL_OPTIONS.map((symbol) => ({
	label: symbol.id,
	value: symbol.id
}));

const SPINNER_FRAMES = ['⣾⡇', '⣽⡇', '⣻⡇', '⢿⡇', '⡿⠇', '⣟⡃', '⣯⡅', '⣷⡆'];

export async function runCli(
	ports = createNodePorts()
): Promise<GenerationResult> {
	const symbol = await ports.select('Choose symbol', SYMBOL_CHOICES);
	const candleType = (await ports.select(
		'Choose candle type',
		CANDLE_TYPE_OPTIONS
	)) as CandleType;
	const candleInterval = await ports.text(
		`Candle interval (${candleType})`,
		(value) =>
			value?.trim() === '' || value === undefined
				? 'Please enter a value.'
				: undefined
	);

	const inputs = normalizeInputs({ symbol, candleType, candleInterval });
	const task = ports.spinner();
	const message = `Generating market data for ${inputs.symbol} ${inputs.candleInterval} ${inputs.candleType}...`;

	task.start(message);
	try {
		const result = await generateAndWriteMarketData(inputs);
		task.stop(`Wrote ${result.candles.length} candles to ${result.filePath}`);

		return result;
	} catch (error) {
		task.error('Failed to generate market data');
		throw error;
	}
}

type WorkerMessage =
	| { result: GenerationResult }
	| { error: { message: string; stack?: string } };

function generateAndWriteMarketData(inputs: GeneratorInputs) {
	return new Promise<GenerationResult>((resolve, reject) => {
		const worker = new Worker(getGenerationWorkerUrl(), {
			execArgv: getGenerationWorkerExecArgv(),
			workerData: inputs
		});

		worker.once('message', (message: WorkerMessage) => {
			if ('error' in message) {
				const error = new Error(message.error.message);
				error.stack = message.error.stack;
				reject(error);

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
		},
		text: async (message, validate) => {
			const answer = await text({
				input,
				message,
				output,
				validate
			});

			if (isCancel(answer)) {
				throw new Error('Cancelled');
			}

			return answer;
		}
	};
}
