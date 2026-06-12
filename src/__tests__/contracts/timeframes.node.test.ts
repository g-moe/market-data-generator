import { describe, expect, it } from 'vitest';

import {
	CALC_TIMEFRAME_ERROR,
	CALC_TIMEFRAME_PATTERN,
	getTimeframes,
	TIMEFRAME_KEYS
} from '../../contracts/timeframes.ts';

describe('timeframes', () => {
	it('defines canonical timeframe keys in output naming order', () => {
		expect(TIMEFRAME_KEYS).toEqual(['1d', '1s', '5m', '10r', '15s', '100t', '500v']);
	});

	it('builds canonical symbol-specific suffixes', () => {
		expect(getTimeframes('/ES:XCME').map((timeframe) => timeframe.suffix)).toEqual([
			'1d',
			'1s',
			'5m',
			'10r',
			'15s',
			'100t',
			'500v'
		]);
	});

	it('validates calc timeframes with the same canonical suffix language', () => {
		expect(CALC_TIMEFRAME_PATTERN.test('same')).toBe(true);
		expect(CALC_TIMEFRAME_PATTERN.test('10r')).toBe(true);
		expect(CALC_TIMEFRAME_PATTERN.test('1s')).toBe(true);
		expect(CALC_TIMEFRAME_PATTERN.test('1s_pl0.25')).toBe(false);
		expect(CALC_TIMEFRAME_PATTERN.test('5m_pl0.25')).toBe(false);
		expect(CALC_TIMEFRAME_PATTERN.test('pl0.25')).toBe(false);
		expect(CALC_TIMEFRAME_ERROR).toContain('1s');
	});
});
