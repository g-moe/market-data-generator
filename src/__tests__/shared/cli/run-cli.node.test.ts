import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { listSymbolOptions } from '../../../shared/cli/symbol-args.ts';
import {
	getGenerationWorkerExecArgvForModuleUrl,
	getGenerationWorkerUrlForModuleUrl,
	runCli,
	type CliPorts
} from '../../../shared/cli/run-cli.ts';

afterEach(() => {
	vi.restoreAllMocks();
	vi.resetModules();
});

describe('runCli', () => {
	it('collects inputs, shows progress, and writes the SCID file', async () => {
		const events: string[] = [];
		const outputDir = await mkdtemp(join(tmpdir(), 'market-data-cli-'));

		try {
			const result = await runCli('ES', ports({ events }), {
				outputDir,
				sessionCount: 1,
				ticksPerSession: 5
			});

			expect(result.counts.ticks).toBe(5);
			expect(result.files.scid).toBe(join(outputDir, 'ES', 'tradester_ES.scid'));
			expect(events).toContain('start:Generating market data for /ES:XCME...');
			expect(events).toContain('log:Completed sessions 1-1 of 1');
			expect(events).toContain(`stop:Wrote 5 ticks to ${join(outputDir, 'ES')}`);
			expect((await readFile(result.files.scid)).toString('ascii', 0, 4)).toBe('SCID');
		} finally {
			await rm(outputDir, { force: true, recursive: true });
		}
	}, 15_000);

	it('requires a symbol argument and prints all symbol options', async () => {
		const events: string[] = [];

		await expect(runCli(undefined, ports({ events }))).rejects.toThrow(
			`Symbol argument is required.\n${listSymbolOptions()}`
		);
		expect(events).toEqual([]);
	});

	it('throws when an invalid symbol is passed and prints all symbol options', async () => {
		const events: string[] = [];

		await expect(runCli('bad-symbol', ports({ events }))).rejects.toThrow(
			`Unknown symbol "bad-symbol".\n${listSymbolOptions()}`
		);
		expect(events).toEqual([]);
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

		const { runCli: runCliWithMockWorker } = await import('../../../shared/cli/run-cli.ts');

		await expect(
			runCliWithMockWorker('ES', ports({ events }), { useWorker: true })
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

		const { runCli: runCliWithMockWorker } = await import('../../../shared/cli/run-cli.ts');

		await expect(
			runCliWithMockWorker('ES', ports({ events }), { useWorker: true })
		).rejects.toThrow('Generation worker exited with code 1');
		expect(events).toContain('error:Failed to generate market data');
	});
});

describe('createNodePorts', () => {
	it('writes spinner output', async () => {
		const output = writable();
		const { createNodePorts } = await import('../../../shared/cli/run-cli.ts');
		const ports = createNodePorts({ output });

		const spinner = ports.spinner();
		vi.useFakeTimers();
		try {
			ports.log('Before start');
			spinner.start('Working');
			ports.log('Progress');
			vi.advanceTimersByTime(100);
			spinner.stop('Done');
			spinner.error('Failed');
		} finally {
			vi.useRealTimers();
		}

		const chunks = output.chunks.join('');
		expect(chunks).toContain('Before start');
		expect(chunks).toContain('Progress');
		expect(chunks).toContain('Done');
		expect(chunks).toContain('Failed');
	});
});

describe('generation worker module helpers', () => {
	it('uses tsx for TypeScript worker modules', () => {
		const moduleUrl = 'file:///repo/src/shared/cli/run-cli.ts';

		expect(getGenerationWorkerUrlForModuleUrl(moduleUrl).href).toBe(
			'file:///repo/src/shared/cli/generation-worker.ts'
		);
		expect(getGenerationWorkerExecArgvForModuleUrl(moduleUrl)).toEqual(['--import', 'tsx']);
	});

	it('uses plain JavaScript worker modules after build output', () => {
		const moduleUrl = 'file:///repo/dist/shared/cli/run-cli.js';

		expect(getGenerationWorkerUrlForModuleUrl(moduleUrl).href).toBe(
			'file:///repo/dist/shared/cli/generation-worker.js'
		);
		expect(getGenerationWorkerExecArgvForModuleUrl(moduleUrl)).toBeUndefined();
	});
});

function ports({ events }: { events: string[] }): CliPorts {
	return {
		log: (message) => {
			events.push(`log:${message}`);
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
