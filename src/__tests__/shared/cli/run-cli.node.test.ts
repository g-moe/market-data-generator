import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runCli, type CliPorts } from '../../../shared/cli/run-cli.ts';

afterEach(() => {
	vi.restoreAllMocks();
	vi.resetModules();
});

describe('runCli', () => {
	it('collects inputs, shows progress, and writes the SCID file', async () => {
		const events: string[] = [];
		const outputDir = await mkdtemp(join(tmpdir(), 'market-data-cli-'));

		try {
			const result = await runCli(
				ports({
					events,
					selectAnswers: ['/ES:XCME']
				}),
				{ outputDir, sessionCount: 1, ticksPerSession: 5 }
			);

			expect(result.counts.ticks).toBe(5);
			expect(result.files.scid).toBe(
				join(outputDir, 'ES', 'tradester_ES.scid')
			);
			expect(events).toContain('select:Choose symbol');
			expect(events).toContain('start:Generating market data for /ES:XCME...');
			expect(events).toContain('log:Completed sessions 1-1 of 1');
			expect(events).toContain(
				`stop:Wrote 5 ticks to ${join(outputDir, 'ES')}`
			);
			expect((await readFile(result.files.scid)).toString('ascii', 0, 4)).toBe(
				'SCID'
			);
		} finally {
			await rm(outputDir, { force: true, recursive: true });
		}
	}, 15_000);

	it('stops the spinner with an error when generation fails', async () => {
		const events: string[] = [];

		await expect(
			runCli(
				ports({
					events,
					selectAnswers: ['bad-symbol']
				})
			)
		).rejects.toThrow(/symbol/i);
		expect(events).not.toContain(
			'start:Generating market data for bad-symbol...'
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
			await import('../../../shared/cli/run-cli.ts');

		await expect(
			runCliWithMockWorker(
				ports({
					events,
					selectAnswers: ['/ES:XCME']
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
			await import('../../../shared/cli/run-cli.ts');

		await expect(
			runCliWithMockWorker(
				ports({
					events,
					selectAnswers: ['/ES:XCME']
				})
			)
		).rejects.toThrow('Generation worker exited with code 1');
		expect(events).toContain('error:Failed to generate market data');
	});
});

describe('createNodePorts', () => {
	it('reads prompt input and writes spinner output', async () => {
		const input = readable('1\n');
		const output = writable();

		const { createNodePorts } = await import('../../../shared/cli/run-cli.ts');
		const promptPorts = createNodePorts({ input, output });

		await expect(
			promptPorts.select('Choose symbol', [{ label: 'ES', value: '/ES:XCME' }])
		).resolves.toBe('/ES:XCME');

		const spinner = promptPorts.spinner();
		vi.useFakeTimers();
		try {
			spinner.start('Working');
			promptPorts.log('Progress');
			vi.advanceTimersByTime(100);
			spinner.stop('Done');
			spinner.error('Failed');
		} finally {
			vi.useRealTimers();
		}

		expect(output.chunks.join('')).toContain('Choose symbol');
		expect(output.chunks.join('')).toContain('1. ES');
		expect(output.chunks.join('')).toContain('Working');
		expect(output.chunks.join('')).toContain('\r\x1B[2KProgress\n');
		expect(output.chunks.join('')).toContain('◇Done\n');
		expect(output.chunks.join('')).toContain('■Failed\n');
	});
	it('reads text prompt input', async () => {
		const input = readable('my-run\n');
		const output = writable();
		const { createNodePorts } = await import('../../../shared/cli/run-cli.ts');
		const promptPorts = createNodePorts({ input, output });

		await expect(promptPorts.prompt('Run name')).resolves.toBe('my-run');
		expect(output.chunks.join('')).toContain('Run name: ');
	});

	it('prompts again until a valid choice is entered', async () => {
		const input = readable('\nbad\n2\n');
		const output = writable();
		const { createNodePorts } = await import('../../../shared/cli/run-cli.ts');
		const promptPorts = createNodePorts({ input, output });

		await expect(
			promptPorts.select('Choose symbol', [
				{ label: 'ES', value: '/ES:XCME' },
				{ label: 'NQ', value: '/NQ:XCME' }
			])
		).resolves.toBe('/NQ:XCME');

		expect(output.chunks.join('')).toContain('Invalid choice. Try again.');
	});
});

function ports({
	events,
	selectAnswers,
	promptAnswers = []
}: {
	events: string[];
	selectAnswers: string[];
	promptAnswers?: string[];
}): CliPorts {
	return {
		log: (message) => {
			events.push(`log:${message}`);
		},
		prompt: async (message) => {
			events.push(`prompt:${message}`);

			return promptAnswers.shift() ?? '';
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
		})
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

function readable(input: string) {
	const stream = new PassThrough();
	stream.end(input);

	return stream as unknown as typeof import('node:process').stdin;
}
