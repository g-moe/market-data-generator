import { describe, expect, it } from 'vitest';

import { runCalcColumnKeyHelper } from '../../../shared/cli/calc-column-key-helper.ts';

describe('runCalcColumnKeyHelper', () => {
	it('prompts for a calc key definition and prints every output key', async () => {
		const ports = createPorts([
			'macd5m',
			'same',
			'macd',
			'src',
			'close',
			'fast',
			'12',
			'',
			'value',
			'hist',
			''
		]);

		await expect(runCalcColumnKeyHelper(ports)).resolves.toEqual([
			'calc__name:macd5m__tf:same__id:macd__src:close__fast:12__out:value',
			'calc__name:macd5m__tf:same__id:macd__src:close__fast:12__out:hist'
		]);
		expect(ports.prompts).toEqual([
			'name',
			'tf (same, 5m, 15s, 1d, 500v, 100t)',
			'id',
			'param key',
			'param src value',
			'param key',
			'param fast value',
			'param key',
			'out',
			'out',
			'out'
		]);
		expect(ports.writes).toContain('Params: leave key blank when done.');
		expect(ports.writes).toContain('Out keys: leave blank when done.');
		expect(ports.writes).toContain('Calc column keys:');
		expect(ports.writes).toContain(
			'calc__name:macd5m__tf:same__id:macd__src:close__fast:12__out:hist'
		);
	});

	it('re-prompts timeframe immediately when the value is invalid', async () => {
		const ports = createPorts(['100sma', 'samd', 'same', 'sma', '', 'value', '']);

		await expect(runCalcColumnKeyHelper(ports)).resolves.toEqual([
			'calc__name:100sma__tf:same__id:sma__out:value'
		]);
		expect(ports.prompts.slice(0, 4)).toEqual([
			'name',
			'tf (same, 5m, 15s, 1d, 500v, 100t)',
			'tf (same, 5m, 15s, 1d, 500v, 100t)',
			'id'
		]);
		expect(ports.validationFailures).toContain(
			'tf (same, 5m, 15s, 1d, 500v, 100t): tf must be same or a timeframe like 5m, 15s, 1d, 500v, or 100t'
		);
	});

	it('re-prompts required and repeated fields before continuing', async () => {
		const ports = createPorts(['', '100sma', 'same', 'sma', '', '', 'value', '']);

		await expect(runCalcColumnKeyHelper(ports)).resolves.toEqual([
			'calc__name:100sma__tf:same__id:sma__out:value'
		]);
		expect(ports.prompts.slice(0, 2)).toEqual(['name', 'name']);
		expect(ports.validationFailures).toContain('name: name is required');
		expect(ports.validationFailures).toContain('out: At least one out key is required');
	});

	it('re-prompts duplicate param and out keys before generating output', async () => {
		const ports = createPorts([
			'macd5m',
			'same',
			'macd',
			'src',
			'close',
			'src',
			'fast',
			'12',
			'',
			'value',
			'value',
			'hist',
			''
		]);

		await expect(runCalcColumnKeyHelper(ports)).resolves.toEqual([
			'calc__name:macd5m__tf:same__id:macd__src:close__fast:12__out:value',
			'calc__name:macd5m__tf:same__id:macd__src:close__fast:12__out:hist'
		]);
		expect(ports.validationFailures).toContain('param key: duplicate parameter key "src"');
		expect(ports.validationFailures).toContain('out: duplicate out key "value"');
	});
});

function createPorts(answers: string[]) {
	const prompts: string[] = [];
	const validationFailures: string[] = [];
	const writes: string[] = [];

	return {
		prompt: (config: { message: string; validate: (value: string) => true | string }) => {
			while (true) {
				const answer = answers.shift() ?? '';
				prompts.push(config.message);

				const validation = config.validate(answer);
				if (validation === true) {
					return Promise.resolve(answer);
				}

				validationFailures.push(`${config.message}: ${validation}`);
			}
		},
		prompts,
		validationFailures,
		write: (message: string) => {
			writes.push(message);
		},
		writes
	};
}
