import { describe, expect, it } from 'vitest';

import { listSymbolOptions } from '../../../shared/cli/symbol-args.ts';

describe('listSymbolOptions', () => {
	it('returns all configured symbols as a newline list', () => {
		const options = listSymbolOptions();
		const lines = options.split('\n');

		expect(lines[0]).toBe('Available symbols:');
		expect(lines).toContain('- ES (/ES:XCME): E-mini S&P 500');
		expect(lines).toContain('- NQ (/NQ:XCME): E-mini NASDAQ-100');
	});
});
