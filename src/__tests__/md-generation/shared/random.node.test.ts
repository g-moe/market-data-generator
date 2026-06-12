import { describe, expect, it } from 'vitest';

import { createRandom, randomSigned } from '../../../md-generation/shared/random.ts';

describe('createRandom', () => {
	it('returns a deterministic sequence for the same seed', () => {
		const first = createRandom(42);
		const second = createRandom(42);

		expect([first(), first(), first()]).toEqual([second(), second(), second()]);
	});

	it('keeps signed random values in the expected range', () => {
		const random = createRandom(7);

		for (let index = 0; index < 20; index++) {
			expect(randomSigned(random)).toBeGreaterThanOrEqual(-1);
			expect(randomSigned(random)).toBeLessThan(1);
		}
	});
});
