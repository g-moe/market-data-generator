import { describe, expect, it } from 'vitest';

import {
	buildCalcColumnKeys,
	buildCalculationsJson,
	isCalcColumnKey,
	parseCalcColumnName,
	validateCalcColumnKey
} from '../../shared/calc-column-key.ts';

describe('buildCalcColumnKeys', () => {
	it('builds one calc column key for each output', () => {
		expect(
			buildCalcColumnKeys({
				indicatorId: 'macd',
				name: 'macd5m',
				outputs: ['value', 'hist', 'signal'],
				params: [
					{ key: 'src', value: 'close' },
					{ key: 'fast', value: '12' },
					{ key: 'slow', value: '26' },
					{ key: 'signal', value: '9' }
				],
				timeframe: 'same'
			})
		).toEqual([
			'calc__name:macd5m__tf:same__id:macd__src:close__fast:12__slow:26__signal:9__out:value',
			'calc__name:macd5m__tf:same__id:macd__src:close__fast:12__slow:26__signal:9__out:hist',
			'calc__name:macd5m__tf:same__id:macd__src:close__fast:12__slow:26__signal:9__out:signal'
		]);
	});

	it('requires at least one output', () => {
		expect(() =>
			buildCalcColumnKeys({
				indicatorId: 'sma',
				name: 'sma100',
				outputs: [],
				params: [{ key: 'src', value: 'close' }],
				timeframe: '5m'
			})
		).toThrow('At least one out key is required');
	});

	it('uses the shared calc key validation rules', () => {
		expect(() =>
			buildCalcColumnKeys({
				indicatorId: 'sma',
				name: 'sma100',
				outputs: ['value'],
				params: [
					{ key: 'src', value: 'close' },
					{ key: 'src', value: 'open' }
				],
				timeframe: '5m'
			})
		).toThrow('duplicate parameter key "src"');
	});

	it('rejects duplicate outputs before building keys', () => {
		expect(() =>
			buildCalcColumnKeys({
				indicatorId: 'macd',
				name: 'macd5m',
				outputs: ['value', 'value'],
				params: [{ key: 'src', value: 'close' }],
				timeframe: 'same'
			})
		).toThrow('duplicate out key "value"');
	});
});

describe('parseCalcColumnName', () => {
	it('parses one calc column name into one object', () => {
		expect(
			parseCalcColumnName(
				'calc__name:macd__tf:same__id:macd__src:close__fast:12__slow:26__signal:9__out:hist'
			)
		).toEqual({
			id: 'macd',
			name: 'macd',
			out: 'hist',
			params: {
				fast: '12',
				signal: '9',
				slow: '26',
				src: 'close'
			},
			tf: 'same'
		});
	});

	it('returns an empty params object when the column has no params', () => {
		expect(parseCalcColumnName('calc__name:100sma__tf:same__id:sma__out:value')).toEqual({
			id: 'sma',
			name: '100sma',
			out: 'value',
			params: {},
			tf: 'same'
		});
	});
});

describe('buildCalculationsJson', () => {
	it('groups output keys by indicator definition', () => {
		expect(
			buildCalculationsJson({
				calcColumnKeys: [
					'calc__name:macd5m__tf:same__id:macd__src:close__fast:12__slow:26__signal:9__out:value',
					'calc__name:macd5m__tf:same__id:macd__src:close__fast:12__slow:26__signal:9__out:hist',
					'calc__name:100sma__tf:1d__id:sma__src:close__len:100__out:value'
				],
				symbol: 'ES',
				timeframe: '5m'
			})
		).toEqual({
			indicators: [
				{
					id: 'macd',
					inputs: {
						fast: '12',
						signal: '9',
						slow: '26',
						src: 'close',
						tf: 'same'
					},
					name: 'macd5m',
					outputKeys: ['value', 'hist']
				},
				{
					id: 'sma',
					inputs: {
						len: '100',
						src: 'close',
						tf: '1d'
					},
					name: '100sma',
					outputKeys: ['value']
				}
			],
			symbol: 'ES',
			timeframe: '5m'
		});
	});

	it('rejects duplicate output keys for the same indicator definition', () => {
		expect(() =>
			buildCalculationsJson({
				calcColumnKeys: [
					'calc__name:macd5m__tf:same__id:macd__src:close__fast:12__out:value',
					'calc__name:macd5m__tf:same__id:macd__fast:12__src:close__out:value'
				],
				symbol: 'ES',
				timeframe: '5m'
			})
		).toThrow('Duplicate calc output key "value" for indicator "macd5m"');
	});
});

describe('validateCalcColumnKey', () => {
	it('accepts calc keys with same-file timeframe context', () => {
		expect(() =>
			validateCalcColumnKey('calc__name:100sma__tf:same__id:sma__src:close__len:100__out:value')
		).not.toThrow();
	});

	it('rejects repeated singleton keys', () => {
		expect(() =>
			validateCalcColumnKey('calc__name:100sma__tf:same__id:sma__src:close__out:value__name:Other')
		).toThrow('duplicate name segment');
	});

	it('rejects duplicate input keys', () => {
		expect(() =>
			validateCalcColumnKey('calc__name:100sma__tf:same__id:sma__src:close__src:open__out:value')
		).toThrow('duplicate parameter key "src"');
	});

	it('rejects invalid timeframe values', () => {
		expect(() =>
			validateCalcColumnKey('calc__name:100sma__tf:samd__id:sma__src:close__out:value')
		).toThrow('tf must be same or a canonical timeframe');
	});

	it('detects calc-prefixed keys only', () => {
		expect(isCalcColumnKey('calc__name:100sma__tf:same__id:sma__out:value')).toBe(true);
		expect(isCalcColumnKey('tradester_signal')).toBe(false);
	});
});
