import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runCli, type CliPorts } from '../../cli/run-cli.ts';

afterEach(() => {
	vi.restoreAllMocks();
	vi.resetModules();
});

describe('runCli', () => {
	it('collects inputs, shows progress, and writes the CSV', async () => {
		const events: string[] = [];

		try {
			const result = await runCli(
				ports({
					events,
					selectAnswers: ['/ES:XCME', 'minute'],
					textAnswers: ['5']
				})
			);

			expect(result.candles).toHaveLength(20_000);
			expect(result.filePath).toBe(join('data', 'ESM26-CME.csv'));
			expect(events).toContain('select:Choose symbol');
			expect(events).toContain('select:Choose candle type');
			expect(events).toContain('text:Candle interval (minute)');
			expect(events).toContain(
				'start:Generating market data for /ES:XCME 5 minute...'
			);
			expect(events).toContain(
				'stop:Wrote 20000 candles to data/ESM26-CME.csv'
			);
			expect(await readFile(result.filePath, 'utf8')).toContain(
				'Date,Time,Open,High,Low,Close,Volume,Number of Trades,Bid Volume,Ask Volume'
			);
		} finally {
			await rm('data', { force: true, recursive: true });
		}
	}, 15_000);

	it('validates the candle interval prompt', async () => {
		const events: string[] = [];

		await expect(
			runCli(
				ports({
					events,
					selectAnswers: ['/ES:XCME', 'minute'],
					textAnswers: ['']
				})
			)
		).rejects.toThrow('Please enter a value.');
	});

	it('stops the spinner with an error when generation fails', async () => {
		const events: string[] = [];

		await expect(
			runCli(
				ports({
					events,
					selectAnswers: ['bad-symbol', 'minute'],
					textAnswers: ['5']
				})
			)
		).rejects.toThrow(/symbol/i);
		expect(events).not.toContain(
			'start:Generating market data for bad-symbol 5 minute...'
		);
	});
});

describe('runCli worker handling', () => {
	it('stops the spinner with an error when the worker reports a failure', async () => {
		const events: string[] = [];

		vi.doMock('node:worker_threads', () => ({
			Worker: class extends EventEmitter {
				constructor() {
					super();
					queueMicrotask(() => {
						this.emit('message', {
							error: {
								message: 'worker failed',
								stack: 'worker stack'
							}
						});
					});
				}
			}
		}));

		const { runCli: runCliWithMockWorker } =
			await import('../../cli/run-cli.ts');

		await expect(
			runCliWithMockWorker(
				ports({
					events,
					selectAnswers: ['/ES:XCME', 'minute'],
					textAnswers: ['5']
				})
			)
		).rejects.toThrow('worker failed');
		expect(events).toContain('error:Failed to generate market data');
	});

	it('rejects when the worker exits unsuccessfully', async () => {
		const events: string[] = [];

		vi.doMock('node:worker_threads', () => ({
			Worker: class extends EventEmitter {
				constructor() {
					super();
					queueMicrotask(() => {
						this.emit('exit', 1);
					});
				}
			}
		}));

		const { runCli: runCliWithMockWorker } =
			await import('../../cli/run-cli.ts');

		await expect(
			runCliWithMockWorker(
				ports({
					events,
					selectAnswers: ['/ES:XCME', 'minute'],
					textAnswers: ['5']
				})
			)
		).rejects.toThrow('Generation worker exited with code 1');
		expect(events).toContain('error:Failed to generate market data');
	});
});

describe('createNodePorts', () => {
	it('adapts clack prompts and writes spinner output', async () => {
		const output = writable();

		vi.doMock('@clack/prompts', () => ({
			isCancel: () => false,
			outro: vi.fn<(message: string, options: unknown) => void>(),
			select: vi.fn<() => Promise<string>>().mockResolvedValue('/ES:XCME'),
			text: vi.fn<() => Promise<string>>().mockResolvedValue('5')
		}));

		const clack = await import('@clack/prompts');
		const { createNodePorts } = await import('../../cli/run-cli.ts');
		const promptPorts = createNodePorts({ output });

		promptPorts.outro('Done');
		await expect(
			promptPorts.select('Choose symbol', [{ label: 'ES', value: '/ES:XCME' }])
		).resolves.toBe('/ES:XCME');
		await expect(promptPorts.text('Interval')).resolves.toBe('5');

		const spinner = promptPorts.spinner();
		vi.useFakeTimers();
		try {
			spinner.start('Working');
			vi.advanceTimersByTime(100);
			spinner.stop('Done');
			spinner.error('Failed');
		} finally {
			vi.useRealTimers();
		}

		expect(clack.outro).toHaveBeenCalledWith('Done', { output });
		expect(clack.select).toHaveBeenCalledWith(
			expect.objectContaining({
				message: 'Choose symbol',
				options: [{ label: 'ES', value: '/ES:XCME' }],
				output
			})
		);
		expect(clack.text).toHaveBeenCalledWith(
			expect.objectContaining({
				message: 'Interval',
				output
			})
		);
		expect(output.chunks.join('')).toContain('Working');
		expect(output.chunks.join('')).toContain('◇Done\n');
		expect(output.chunks.join('')).toContain('■Failed\n');
	});

	it('throws when clack prompts are cancelled', async () => {
		const cancel = Symbol('cancel');

		vi.doMock('@clack/prompts', () => ({
			isCancel: (value: unknown) => value === cancel,
			outro: vi.fn<(message: string, options: unknown) => void>(),
			select: vi.fn<() => Promise<symbol>>().mockResolvedValue(cancel),
			text: vi.fn<() => Promise<symbol>>().mockResolvedValue(cancel)
		}));

		const { createNodePorts } = await import('../../cli/run-cli.ts');
		const promptPorts = createNodePorts({ output: writable() });

		await expect(promptPorts.select('Choose symbol', [])).rejects.toThrow(
			'Cancelled'
		);
		await expect(promptPorts.text('Interval')).rejects.toThrow('Cancelled');
	});
});

function ports({
	events,
	selectAnswers,
	textAnswers
}: {
	events: string[];
	selectAnswers: string[];
	textAnswers: string[];
}): CliPorts {
	return {
		outro: (message) => {
			events.push(`outro:${message}`);
		},
		select: async (message) => {
			events.push(`select:${message}`);

			return selectAnswers.shift() ?? '';
		},
		spinner: () => ({
			error: (message) => {
				events.push(`error:${message}`);
			},
			start: (message) => {
				events.push(`start:${message}`);
			},
			stop: (message) => {
				events.push(`stop:${message}`);
			}
		}),
		text: async (message, validate) => {
			events.push(`text:${message}`);
			const answer = textAnswers.shift() ?? '';
			const error = validate?.(answer);
			if (error !== undefined) {
				throw new Error(error);
			}

			return answer;
		}
	};
}

function writable() {
	type TestOutput = typeof import('node:process').stdout & {
		chunks: string[];
	};
	const chunks: string[] = [];

	return {
		chunks,
		write(chunk: string) {
			chunks.push(chunk);

			return true;
		}
	} as unknown as TestOutput;
}
