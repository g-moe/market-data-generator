import { describe, expect, it } from 'vitest';

import { ID_SEQUENCE_MULTIPLIER } from '../../../contracts/defaults.ts';
import { createBarId } from '../../../md-generation/shared/candles.ts';

describe('createBarId', () => {
	it('combines unix milliseconds and same-ms sequence', () => {
		expect(createBarId(1_700_000_000_000, 2)).toBe(
			1_700_000_000_000n * ID_SEQUENCE_MULTIPLIER + 2n
		);
	});
});
