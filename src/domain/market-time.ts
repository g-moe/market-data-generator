import { CENTRAL_TIMEZONE } from '../contracts/market-time.ts';
import type { GeneratorInputs } from '../contracts/types.ts';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const SESSION_MINUTES = 23 * 60;

const TIME_WEIGHT_WINDOWS = [
	{
		end: '10:30:00',
		start: '08:30:00',
		volatility: 4,
		volume: 8
	},
	{
		end: '15:00:00',
		start: '14:00:00',
		volatility: 3,
		volume: 5
	}
] as const;

export function getCandleStart(inputs: GeneratorInputs, candleIndex: number) {
	const start = new Date(inputs.startIso);
	if (inputs.candleType === 'daily') {
		return new Date(
			start.getTime() + candleIndex * inputs.candleInterval * DAY_MS
		);
	}

	const totalSessionMinutes = candleIndex * inputs.candleInterval;
	const sessionOffset = Math.floor(totalSessionMinutes / SESSION_MINUTES);
	const minuteOffset = totalSessionMinutes % SESSION_MINUTES;

	return new Date(
		start.getTime() + sessionOffset * DAY_MS + minuteOffset * MINUTE_MS
	);
}

export function getCandleDurationMs(inputs: GeneratorInputs) {
	if (inputs.candleType === 'daily') return DAY_MS * inputs.candleInterval;

	return MINUTE_MS * inputs.candleInterval;
}

export function isTradingDayStart(time: Date) {
	const parts = getCentralParts(time);

	return parts.time === '17:00:00';
}

export function getTimeWeight(time: Date, kind: 'volume' | 'volatility') {
	const parts = getCentralParts(time);
	const timeValue = toTimeValue(parts.time);
	const matchingWindow = TIME_WEIGHT_WINDOWS.find((window) => {
		return (
			timeValue >= toTimeValue(window.start) &&
			timeValue < toTimeValue(window.end)
		);
	});

	if (matchingWindow) return matchingWindow[kind];

	return 1;
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
		)}:${String(second).padStart(2, '0')}`
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

function toTimeValue(time: string) {
	return Number(time.replaceAll(':', ''));
}
