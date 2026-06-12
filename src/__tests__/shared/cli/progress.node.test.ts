import { describe, expect, it } from 'vitest';

import { formatProgressMessage } from '../../../shared/cli/progress.ts';

describe('formatProgressMessage', () => {
	it('returns progress for non-terminal and completed milestones', () => {
		expect(
			formatProgressMessage({
				completed: 100,
				sessionIndex: 0,
				ticks: 100,
				total: 2000
			})
		).toBeUndefined();

		expect(
			formatProgressMessage({
				completed: 1000,
				sessionIndex: 0,
				ticks: 100,
				total: 2000
			})
		).toBe('Completed sessions 1-1000 of 2000');
	});

	it('returns undefined for non-milestones', () => {
		expect(
			formatProgressMessage({
				completed: 101,
				sessionIndex: 0,
				ticks: 0,
				total: 200
			})
		).toBeUndefined();
	});

	it('always reports the final completion when finished', () => {
		expect(
			formatProgressMessage({
				completed: 200,
				sessionIndex: 0,
				ticks: 250,
				total: 200
			})
		).toBe('Completed sessions 1-200 of 200');
	});
});
