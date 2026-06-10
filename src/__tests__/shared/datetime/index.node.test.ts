import { describe, expect, it } from 'vitest';

import { nowEpochMs } from '../../../shared/datetime/index.ts';

describe('nowEpochMs', () => {
	it('returns a numeric current epoch in milliseconds', () => {
		const now = nowEpochMs();

		expect(typeof now).toBe('number');
		expect(Number.isFinite(now)).toBe(true);
		expect(now).toBeGreaterThan(1_000_000_000_000);
	});
});
