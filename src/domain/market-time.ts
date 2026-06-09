import { CENTRAL_TIMEZONE } from '../contracts/market-time.ts';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const SESSION_START_HOUR = 17;
const SESSION_END_HOUR = 16;

export function getSessionStart(anchorIso: string, sessionsBack: number) {
	let cursor = getSessionStartForTime(new Date(anchorIso).getTime());
	let remaining = sessionsBack;

	while (remaining > 0) {
		cursor -= DAY_MS;
		if (isTradingSessionStart(cursor)) remaining--;
	}

	return cursor;
}

export function getSessionEnd(sessionStart: number) {
	return sessionStart + 23 * HOUR_MS;
}

export function isMarketOpen(time: number) {
	const parts = getCentralParts(new Date(time));
	const day = parts.weekday;
	const minuteOfDay = parts.hour * 60 + parts.minute;

	if (day === 'Sat') return false;
	if (day === 'Sun') return minuteOfDay >= SESSION_START_HOUR * 60;
	if (day === 'Fri') return minuteOfDay < SESSION_END_HOUR * 60;

	return !(
		minuteOfDay >= SESSION_END_HOUR * 60 &&
		minuteOfDay < SESSION_START_HOUR * 60
	);
}

export function getDailySessionStart(time: number) {
	return getSessionStartForTime(time);
}

export function floorTime(time: number, bucketMs: number) {
	return Math.floor(time / bucketMs) * bucketMs;
}

export function getCentralParts(time: Date) {
	const parts = new Intl.DateTimeFormat('en-US', {
		day: '2-digit',
		hour: '2-digit',
		hour12: false,
		minute: '2-digit',
		month: '2-digit',
		second: '2-digit',
		timeZone: CENTRAL_TIMEZONE,
		timeZoneName: 'shortOffset',
		weekday: 'short',
		year: 'numeric'
	}).formatToParts(time);
	const value = (type: string) => {
		return parts.find((part) => part.type === type)?.value ?? '';
	};
	const hour = Number(value('hour'));
	const minute = Number(value('minute'));
	const second = Number(value('second'));

	return {
		date: `${value('year')}-${value('month')}-${value('day')}`,
		hour,
		minute,
		second,
		time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(
			2,
			'0'
		)}:${String(second).padStart(2, '0')}`,
		weekday: value('weekday')
	};
}

export function getUtcParts(time: Date) {
	return {
		date: [
			time.getUTCFullYear(),
			String(time.getUTCMonth() + 1).padStart(2, '0'),
			String(time.getUTCDate()).padStart(2, '0')
		].join('-'),
		time: [
			String(time.getUTCHours()).padStart(2, '0'),
			String(time.getUTCMinutes()).padStart(2, '0'),
			String(time.getUTCSeconds()).padStart(2, '0')
		].join(':')
	};
}

function getSessionStartForTime(time: number) {
	const parts = getCentralParts(new Date(time));
	const sameDayStart = centralDateTimeToUtcMs(
		Number(parts.date.slice(0, 4)),
		Number(parts.date.slice(5, 7)),
		Number(parts.date.slice(8, 10)),
		SESSION_START_HOUR,
		0,
		0
	);
	const minuteOfDay = parts.hour * 60 + parts.minute;

	return minuteOfDay >= SESSION_START_HOUR * 60
		? sameDayStart
		: sameDayStart - DAY_MS;
}

function isTradingSessionStart(time: number) {
	const parts = getCentralParts(new Date(time));

	return parts.weekday !== 'Fri' && parts.weekday !== 'Sat';
}

function centralDateTimeToUtcMs(
	year: number,
	month: number,
	day: number,
	hour: number,
	minute: number,
	second: number
) {
	const guess = Date.UTC(year, month - 1, day, hour, minute, second);
	const offset = getCentralOffsetMs(new Date(guess));

	return guess - offset;
}

function getCentralOffsetMs(time: Date) {
	const zoneName =
		new Intl.DateTimeFormat('en-US', {
			timeZone: CENTRAL_TIMEZONE,
			timeZoneName: 'shortOffset'
		})
			.formatToParts(time)
			.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
	const match =
		/^GMT(?<sign>[+-])(?<hours>\d{1,2})(?::(?<minutes>\d{2}))?$/.exec(zoneName);
	/* v8 ignore next -- Intl returns GMT offsets for the configured timezone in supported Node builds. */
	if (!match?.groups) return 0;

	const sign = match.groups.sign === '-' ? -1 : 1;
	const hours = Number(match.groups.hours);
	const minutes = Number(match.groups.minutes ?? '0');

	return sign * (hours * HOUR_MS + minutes * MINUTE_MS);
}
