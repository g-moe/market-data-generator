import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
	vi.restoreAllMocks();
	vi.resetModules();
	vi.doUnmock('@inquirer/prompts');
});

describe('runCalcColumnKeyHelper node ports', () => {
	it('uses Inquirer prompts and console output when custom ports are omitted', async () => {
		const answers = ['sma5m', 'same', 'sma', '', 'value', ''];
		const prompts: string[] = [];
		const writes: string[] = [];

		vi.doMock('@inquirer/prompts', () => ({
			input: (config: { message: string; validate: (value: string) => true | string }) => {
				const answer = answers.shift() ?? '';
				prompts.push(config.message);

				const validation = config.validate(answer);
				if (validation !== true) {
					throw new Error(validation);
				}

				return Promise.resolve(answer);
			}
		}));
		vi.spyOn(console, 'log').mockImplementation((message = '') => {
			writes.push(message);
		});

		const { runCalcColumnKeyHelper } =
			await import('../../../shared/cli/calc-column-key-helper.ts');

		await expect(runCalcColumnKeyHelper()).resolves.toEqual([
			'calc__name:sma5m__tf:same__id:sma__out:value'
		]);
		expect(prompts).toEqual([
			'name',
			'tf (same, 5m, 15s, 1d, 500v, 100t)',
			'id',
			'param key',
			'out',
			'out'
		]);
		expect(writes).toContain('Calc column keys:');
		expect(writes).toContain('calc__name:sma5m__tf:same__id:sma__out:value');
	});
});
