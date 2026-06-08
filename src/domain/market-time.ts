import { CENTRAL_TIMEZONE } from '../contracts/index.ts';
import type { GeneratorInputs } from '../contracts/index.ts';

export { CENTRAL_TIMEZONE };

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const SESSION_MINUTES = 23 * 60;

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
	const seconds = parts.hour * 3600 + parts.minute * 60 + parts.second;
	const rthMorning = seconds >= 8.5 * 3600 && seconds < 10.5 * 3600;
	const rthAfternoon = seconds >= 14 * 3600 && seconds < 15 * 3600;

	if (rthMorning) return kind === 'volume' ? 8 : 4;
	if (rthAfternoon) return kind === 'volume' ? 5 : 3;

	return 1;
}

export function getCentralParts(time: Date) {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: CENTRAL_TIMEZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false
	}).formatToParts(time);
	const value = (type: string) => {
		return parts.find((part) => part.type === type)?.value ?? '';
	};
	const hour = Number(value('hour'));
	const minute = Number(value('minute'));
	const second = Number(value('second'));

	return {
		date: `${value('year')}-${value('month')}-${value('day')}`,
		time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(
			2,
			'0'
		)}:${String(second).padStart(2, '0')}`,
		hour,
		minute,
		second
	};
}
