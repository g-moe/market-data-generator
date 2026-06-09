import { describe, expect, it } from 'vitest';

import { roundToTick } from '../../md-generation/price.ts';

describe('roundToTick', () => {
	it('rounds prices to the nearest allowed tick', () => {
		expect(roundToTick(100.12, 0.25)).toBe(100);
		expect(roundToTick(100.13, 0.25)).toBe(100.25);
		expect(roundToTick(1.23456789, 0.0001)).toBe(1.2346);
	});
});
