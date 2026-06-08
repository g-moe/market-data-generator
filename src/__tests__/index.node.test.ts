import { describe, expect, it } from 'vitest';

import {
	buildCandles,
	buildTicks,
	generateMarketData,
	normalizeInputs,
	serializeCandlesToCsv,
	writeCandlesCsv
} from '../index.ts';

describe('public exports', () => {
	it('exports the generator API from the package entrypoint', () => {
		expect(buildCandles).toBeTypeOf('function');
		expect(buildTicks).toBeTypeOf('function');
		expect(generateMarketData).toBeTypeOf('function');
		expect(normalizeInputs).toBeTypeOf('function');
		expect(serializeCandlesToCsv).toBeTypeOf('function');
		expect(writeCandlesCsv).toBeTypeOf('function');
	});
});
