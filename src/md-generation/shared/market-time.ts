import {
	addUtcCalendarDays,
	parseIsoToUnixMs,
	toUtcParts,
	utcDateTimeToUnixMs
} from '../../shared/datetime/index.ts';
import {
	MARKET_SESSION_DURATION_MS,
	MARKET_SESSION_END_HOUR,
	MARKET_SESSION_START_HOUR
} from './market-time-constants.ts';

type UtcSessionParts = {
	date: string;
	day: number;
	month: number;
	dayOfWeek: number;
	hour: number;
	minute: number;
	second: number;
	time: string;
	weekday: string;
	year: number;
};

export function getSessionStart(anchorIso: string, sessionsBack: number) {
	let cursor = getSessionStartForTime(parseIsoToUnixMs(anchorIso));
	let remaining = sessionsBack;

	while (remaining > 0) {
		cursor = getPreviousSessionStart(cursor);

		if (isTradingSessionStart(cursor)) {
			remaining--;
		}
	}

	return cursor;
}

export function getSessionEnd(sessionStart: number) {
	return sessionStart + MARKET_SESSION_DURATION_MS;
}

export function isMarketOpen(time: number) {
	const parts = getSessionDateParts(time);
	const minuteOfDay = parts.hour * 60 + parts.minute;

	if (parts.weekday === 'Sat') {
		return false;
	}

	if (parts.weekday === 'Sun') {
		return minuteOfDay >= MARKET_SESSION_START_HOUR * 60;
	}

	if (parts.weekday === 'Fri') {
		return minuteOfDay < MARKET_SESSION_END_HOUR * 60;
	}

	return !(
		minuteOfDay >= MARKET_SESSION_END_HOUR * 60 && minuteOfDay < MARKET_SESSION_START_HOUR * 60
	);
}

export function getDailySessionStart(time: number) {
	return getSessionStartForTime(time);
}

export function floorTime(time: number, bucketMs: number) {
	return Math.floor(time / bucketMs) * bucketMs;
}

function getSessionDateParts(time: number): UtcSessionParts {
	const parts = toUtcParts(time);

	return {
		date: parts.date,
		day: parts.day,
		dayOfWeek: parts.dayOfWeek,
		hour: parts.hour,
		minute: parts.minute,
		month: parts.month,
		second: parts.second,
		time: parts.time,
		weekday: parts.weekday,
		year: parts.year
	};
}

export function getUtcParts(time: number) {
	const parts = getSessionDateParts(time);

	return {
		date: parts.date,
		time: parts.time
	};
}

function getSessionStartForTime(time: number) {
	const parts = getSessionDateParts(time);
	const sameDayStart = utcDateTimeToUnixMs(
		parts.year,
		parts.month,
		parts.day,
		MARKET_SESSION_START_HOUR,
		0,
		0
	);
	const minuteOfDay = parts.hour * 60 + parts.minute;

	if (minuteOfDay >= MARKET_SESSION_START_HOUR * 60) {
		return sameDayStart;
	}

	const previous = addUtcCalendarDays(parts.year, parts.month, parts.day, -1);

	return utcDateTimeToUnixMs(
		previous.year,
		previous.month,
		previous.day,
		MARKET_SESSION_START_HOUR,
		0,
		0
	);
}

export function isTradingSessionStart(time: number) {
	const { weekday } = getSessionDateParts(time);

	return weekday !== 'Fri' && weekday !== 'Sat';
}

export function getPreviousSessionStart(sessionStart: number) {
	const parts = getSessionDateParts(sessionStart);
	const previous = addUtcCalendarDays(parts.year, parts.month, parts.day, -1);

	return utcDateTimeToUnixMs(
		previous.year,
		previous.month,
		previous.day,
		MARKET_SESSION_START_HOUR,
		0,
		0
	);
}
