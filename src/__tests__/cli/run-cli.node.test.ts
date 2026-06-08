import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { runCli, type CliPorts } from '../../cli/run-cli.ts';

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
			expect(result.filePath).toBe(join('data', 'es_5minute.csv'));
			expect(events).toContain('select:Choose symbol');
			expect(events).toContain('select:Choose candle type');
			expect(events).toContain('text:Candle interval (minute)');
			expect(events).toContain(
				'start:Generating market data for /ES:XCME 5 minute...'
			);
			expect(events).toContain(
				'stop:Wrote 20000 candles to data/es_5minute.csv'
			);
			expect(await readFile(result.filePath, 'utf8')).toContain(
				'Date,Time,Open,High,Low,Close,Volume,Bid Volume,Ask Volume'
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
