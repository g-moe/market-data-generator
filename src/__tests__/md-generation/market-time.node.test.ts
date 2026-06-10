import { describe, expect, it } from 'vitest';

import {
	getDailySessionStart,
	getSessionEnd,
	getSessionStart,
	getUtcParts,
	isMarketOpen
} from '../../md-generation/market-time.ts';
import {
	parseIsoToUnixMs,
	toIsoString,
	toUtcParts
} from '../../shared/datetime/index.ts';

describe('futures market time', () => {
	it('detects futures open and maintenance periods in UTC', () => {
		expect(isMarketOpen(parseIsoToUnixMs('2026-06-07T21:59:59.999Z'))).toBe(
			false
		);
		expect(isMarketOpen(parseIsoToUnixMs('2026-06-07T22:00:00.000Z'))).toBe(
			true
		);
		expect(isMarketOpen(parseIsoToUnixMs('2026-06-08T21:30:00.000Z'))).toBe(
			false
		);
		expect(isMarketOpen(parseIsoToUnixMs('2026-06-08T22:00:00.000Z'))).toBe(
			true
		);
	});

	it('finds the current UTC trading session start', () => {
		const start = getSessionStart('2026-06-05T21:00:00.000Z', 0);

		expect(toIsoString(start)).toBe('2026-06-04T22:00:00.000Z');
		expect(getSessionEnd(start) - start).toBe(23 * 60 * 60 * 1000);
	});

	it('keeps UTC session starts fixed at 22:00', () => {
		const starts = [
			toIsoString(getSessionStart('2026-03-10T23:00:00.000Z', 0)),
			toIsoString(getSessionStart('2006-10-29T23:00:00.000Z', 0)),
			toIsoString(getSessionStart('1970-03-10T10:00:00.000Z', 0)),
			toIsoString(getSessionStart('1969-12-31T21:00:00.000Z', 0)),
			toIsoString(getSessionStart('1970-01-01T22:00:00.000Z', 0))
		];

		expect(
			starts.map((start) => toUtcParts(parseIsoToUnixMs(start)).time)
		).toEqual(Array(5).fill('22:00:00'));
	});

	it('walks backward by trading session starts in UTC, skipping Fri/Sat starts', () => {
		const starts = Array.from({ length: 5 }, (_, sessionsBack) =>
			toIsoString(getSessionStart('2026-06-07T22:00:00.000Z', sessionsBack))
		);

		expect(starts).toEqual([
			'2026-06-07T22:00:00.000Z',
			'2026-06-04T22:00:00.000Z',
			'2026-06-03T22:00:00.000Z',
			'2026-06-02T22:00:00.000Z',
			'2026-06-01T22:00:00.000Z'
		]);
	});

	it('uses epoch-safe UTC boundaries', () => {
		expect(toIsoString(getSessionStart('1970-01-01T00:00:00.000Z', 0))).toBe(
			'1969-12-31T22:00:00.000Z'
		);
		expect(toIsoString(getSessionStart('1969-12-31T21:59:59.999Z', 0))).toBe(
			'1969-12-30T22:00:00.000Z'
		);
	});

	it('handles unix epoch values in UTC parts', () => {
		expect(getUtcParts(0)).toMatchObject({
			date: '1970-01-01',
			time: '00:00:00'
		});
	});

	it('finds the daily session start for intraday ticks', () => {
		const sessionStart = getDailySessionStart(
			parseIsoToUnixMs('2026-06-08T15:30:00.000Z')
		);
		expect(getUtcParts(sessionStart)).toMatchObject({
			time: '22:00:00'
		});

		const eveningSessionStart = getDailySessionStart(
			parseIsoToUnixMs('2026-06-09T01:00:00.000Z')
		);
		expect(getUtcParts(eveningSessionStart)).toMatchObject({
			time: '22:00:00'
		});
	});

	it('formats UTC date and time parts', () => {
		expect(
			getUtcParts(parseIsoToUnixMs('2026-06-08T17:00:00.000-05:00'))
		).toEqual({
			date: '2026-06-08',
			time: '22:00:00'
		});
	});
});
