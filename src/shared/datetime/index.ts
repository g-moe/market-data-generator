import { Temporal as TemporalPolyfill } from '@js-temporal/polyfill';

const TemporalLib =
	(
		globalThis as {
			Temporal?: typeof TemporalPolyfill;
		}
	).Temporal ?? TemporalPolyfill;

export const MILLISECONDS_PER_SECOND = 1000;
export const MILLISECONDS_PER_MINUTE = 60 * MILLISECONDS_PER_SECOND;
export const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE;
const UTC_TIME_ZONE = 'UTC';
const WEEKDAY_ABBREVIATIONS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export type UtcDateParts = {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	second: number;
	millisecond: number;
	dayOfWeek: number;
	weekday: string;
	date: string;
	time: string;
};

export function parseIsoToUnixMs(iso: string) {
	const instant = TemporalLib.Instant.from(iso);

	return Number(instant.epochMilliseconds);
}

export function toIsoString(unixMs: number) {
	const parts = toUtcParts(unixMs);

	return `${parts.date}T${parts.time}.${pad3(parts.millisecond)}Z`;
}

export function toUtcParts(unixMs: number): UtcDateParts {
	const zdt = TemporalLib.Instant.fromEpochMilliseconds(unixMs).toZonedDateTimeISO(UTC_TIME_ZONE);

	return {
		date: `${zdt.year}-${pad2(zdt.month)}-${pad2(zdt.day)}`,
		day: zdt.day,
		dayOfWeek: zdt.dayOfWeek,
		hour: zdt.hour,
		millisecond: zdt.millisecond,
		minute: zdt.minute,
		month: zdt.month,
		second: zdt.second,
		time: `${pad2(zdt.hour)}:${pad2(zdt.minute)}:${pad2(zdt.second)}`,
		weekday: WEEKDAY_ABBREVIATIONS[zdt.dayOfWeek % 7],
		year: zdt.year
	};
}

export function utcDateTimeToUnixMs(
	year: number,
	month: number,
	day: number,
	hour: number,
	minute: number,
	second: number,
	millisecond = 0
) {
	const zdt = TemporalLib.ZonedDateTime.from({
		calendar: 'iso8601',
		day,
		hour,
		millisecond,
		minute,
		month,
		second,
		timeZone: UTC_TIME_ZONE,
		year
	});

	return Number(zdt.epochMilliseconds);
}

export function addUtcCalendarDays(year: number, month: number, day: number, days: number) {
	const date = TemporalLib.PlainDate.from({ day, month, year }).add({ days });

	return {
		day: date.day,
		month: date.month,
		year: date.year
	};
}

export function nowEpochMs() {
	return Number(TemporalLib.Now.instant().epochMilliseconds);
}

function pad2(value: number) {
	return String(value).padStart(2, '0');
}

function pad3(value: number) {
	return String(value).padStart(3, '0');
}
