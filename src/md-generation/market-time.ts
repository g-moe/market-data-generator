import { CENTRAL_TIMEZONE } from '../contracts/market-time.ts';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const SESSION_START_HOUR = 17;
const SESSION_END_HOUR = 16;
const CENTRAL_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
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
});
const CENTRAL_OFFSET_FORMATTER = new Intl.DateTimeFormat('en-US', {
	timeZone: CENTRAL_TIMEZONE,
	timeZoneName: 'shortOffset'
});

export function getSessionStart(anchorIso: string, sessionsBack: number) {
	let cursor = getSessionStartForTime(new Date(anchorIso).getTime());
	let remaining = sessionsBack;

	while (remaining > 0) {
		cursor = getPreviousSessionStart(cursor);
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
	let day = '';
	let hourText = '';
	let minuteText = '';
	let month = '';
	let secondText = '';
	let weekday = '';
	let year = '';
	for (const part of CENTRAL_PARTS_FORMATTER.formatToParts(time)) {
		if (part.type === 'day') day = part.value;
		else if (part.type === 'hour') hourText = part.value;
		else if (part.type === 'minute') minuteText = part.value;
		else if (part.type === 'month') month = part.value;
		else if (part.type === 'second') secondText = part.value;
		else if (part.type === 'weekday') weekday = part.value;
		else if (part.type === 'year') year = part.value;
	}
	const hour = Number(hourText);
	const minute = Number(minuteText);
	const second = Number(secondText);

	return {
		date: `${year}-${month}-${day}`,
		hour,
		minute,
		second,
		time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(
			2,
			'0'
		)}:${String(second).padStart(2, '0')}`,
		weekday
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
	const sameDayStart = centralDateHourToUtcMs(parts.date, SESSION_START_HOUR);
	const minuteOfDay = parts.hour * 60 + parts.minute;

	return minuteOfDay >= SESSION_START_HOUR * 60
		? sameDayStart
		: centralDateHourToUtcMs(
				addCentralCalendarDays(parts.date, -1),
				SESSION_START_HOUR
			);
}

export function isTradingSessionStart(time: number) {
	const parts = getCentralParts(new Date(time));

	return parts.weekday !== 'Fri' && parts.weekday !== 'Sat';
}

export function getPreviousSessionStart(sessionStart: number) {
	const parts = getCentralParts(new Date(sessionStart));

	return centralDateHourToUtcMs(
		addCentralCalendarDays(parts.date, -1),
		SESSION_START_HOUR
	);
}

function centralDateHourToUtcMs(date: string, hour: number) {
	return centralDateTimeToUtcMs(
		Number(date.slice(0, 4)),
		Number(date.slice(5, 7)),
		Number(date.slice(8, 10)),
		hour,
		0,
		0
	);
}

function addCentralCalendarDays(date: string, days: number) {
	const year = Number(date.slice(0, 4));
	const month = Number(date.slice(5, 7));
	const day = Number(date.slice(8, 10));
	const next = new Date(Date.UTC(year, month - 1, day + days));

	return [
		next.getUTCFullYear(),
		String(next.getUTCMonth() + 1).padStart(2, '0'),
		String(next.getUTCDate()).padStart(2, '0')
	].join('-');
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
	let zoneName = 'GMT';
	for (const part of CENTRAL_OFFSET_FORMATTER.formatToParts(time)) {
		if (part.type === 'timeZoneName') {
			zoneName = part.value;
			break;
		}
	}
	const match =
		/^GMT(?<sign>[+-])(?<hours>\d{1,2})(?::(?<minutes>\d{2}))?$/.exec(zoneName);
	/* v8 ignore next -- Intl returns GMT offsets for the configured timezone in supported Node builds. */
	if (!match?.groups) return 0;

	const sign = match.groups.sign === '-' ? -1 : 1;
	const hours = Number(match.groups.hours);
	const minutes = Number(match.groups.minutes ?? '0');

	return sign * (hours * HOUR_MS + minutes * MINUTE_MS);
}
