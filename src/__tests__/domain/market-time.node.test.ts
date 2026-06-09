import { describe, expect, it } from 'vitest';

import {
	getCentralParts,
	getDailySessionStart,
	getSessionEnd,
	getSessionStart,
	getUtcParts,
	isMarketOpen
} from '../../domain/market-time.ts';

describe('futures market time', () => {
	it('detects equity-index futures open and maintenance periods in Central time', () => {
		expect(isMarketOpen(Date.parse('2026-06-07T21:59:59.000Z'))).toBe(false);
		expect(isMarketOpen(Date.parse('2026-06-07T22:00:00.000Z'))).toBe(true);
		expect(isMarketOpen(Date.parse('2026-06-08T21:30:00.000Z'))).toBe(false);
		expect(isMarketOpen(Date.parse('2026-06-08T22:00:00.000Z'))).toBe(true);
		expect(isMarketOpen(Date.parse('2026-06-12T21:00:00.000Z'))).toBe(false);
		expect(isMarketOpen(Date.parse('2026-06-13T15:00:00.000Z'))).toBe(false);
	});

	it('walks backward by trading session starts', () => {
		const start = getSessionStart('2026-06-05T21:00:00.000Z', 0);

		expect(getCentralParts(new Date(start))).toMatchObject({
			time: '17:00:00',
			weekday: 'Thu'
		});
		expect(getSessionEnd(start) - start).toBe(23 * 60 * 60 * 1000);
	});

	it('skips non-trading weekend session starts when walking backward', () => {
		const start = getSessionStart('2026-06-07T22:00:00.000Z', 1);

		expect(getCentralParts(new Date(start))).toMatchObject({
			time: '17:00:00',
			weekday: 'Thu'
		});
	});

	it('keeps session starts at 17:00 CT across spring daylight saving time', () => {
		const starts = Array.from({ length: 6 }, (_, sessionsBack) => {
			return getCentralParts(
				new Date(getSessionStart('2026-03-10T23:00:00.000Z', sessionsBack))
			);
		});

		expect(starts.map((start) => `${start.weekday} ${start.time}`)).toEqual([
			'Tue 17:00:00',
			'Mon 17:00:00',
			'Sun 17:00:00',
			'Thu 17:00:00',
			'Wed 17:00:00',
			'Tue 17:00:00'
		]);
	});

	it('keeps session starts at 17:00 CT across fall daylight saving time', () => {
		const starts = Array.from({ length: 5 }, (_, sessionsBack) => {
			return getCentralParts(
				new Date(getSessionStart('2026-11-04T23:00:00.000Z', sessionsBack))
			);
		});

		expect(starts.map((start) => `${start.weekday} ${start.time}`)).toEqual([
			'Wed 17:00:00',
			'Tue 17:00:00',
			'Mon 17:00:00',
			'Sun 17:00:00',
			'Thu 17:00:00'
		]);
	});

	it('finds the daily session start for intraday ticks', () => {
		const sessionStart = getDailySessionStart(
			Date.parse('2026-06-08T15:30:00.000Z')
		);

		expect(getCentralParts(new Date(sessionStart))).toMatchObject({
			time: '17:00:00',
			weekday: 'Sun'
		});
	});

	it('uses the same-day 17:00 CT session start for evening ticks', () => {
		const sessionStart = getDailySessionStart(
			Date.parse('2026-06-09T01:00:00.000Z')
		);

		expect(getCentralParts(new Date(sessionStart))).toMatchObject({
			time: '17:00:00',
			weekday: 'Mon'
		});
	});

	it('formats UTC date and time parts', () => {
		expect(getUtcParts(new Date('2026-06-08T17:00:00.000-05:00'))).toEqual({
			date: '2026-06-08',
			time: '22:00:00'
		});
	});
});
