import { describe, expect, it } from 'vitest';

import { normalizeInputs } from '../../domain/inputs.ts';
import { buildTicks } from '../../domain/ticks.ts';

describe('buildTicks', () => {
	it('generates the requested number of deterministic ticks', () => {
		const inputs = normalizeInputs({
			candleInterval: '5',
			candleType: 'minute',
			symbol: '/NQ:XCME'
		});
		inputs.candles = 3;
		inputs.startPrice = 19_000;
		inputs.seed = 7;
		inputs.ticksPerCandle = 4;

		expect(buildTicks(inputs)).toEqual(buildTicks(inputs));
		expect(buildTicks(inputs)).toHaveLength(12);
	});

	it('keeps tick prices on the configured tick size', () => {
		const inputs = normalizeInputs({
			candleInterval: '1',
			candleType: 'minute',
			symbol: '/ES:XCME'
		});
		inputs.candles = 10;
		inputs.ticksPerCandle = 6;

		expect(
			buildTicks(inputs).every((tick) => tick.price % inputs.minTickSize === 0)
		).toBe(true);
	});

	it('creates higher aggregate volume during regular trading hours', () => {
		const inputs = normalizeInputs({
			candleInterval: '1',
			candleType: 'minute',
			symbol: '/NQ:XCME'
		});
		inputs.candles = 1_100;
		inputs.startPrice = 19_000;
		inputs.seed = 7;
		inputs.ticksPerCandle = 4;

		const ticks = buildTicks(inputs);
		const regular = ticks.filter(
			(tick) => centralHour(tick.time) >= 8 && centralHour(tick.time) < 11
		);
		const overnight = ticks.filter(
			(tick) => centralHour(tick.time) >= 18 && centralHour(tick.time) < 21
		);

		expect(sumVolume(regular)).toBeGreaterThan(sumVolume(overnight));
	});
});

function centralHour(time: Date) {
	return Number(
		new Intl.DateTimeFormat('en-US', {
			hour: '2-digit',
			hour12: false,
			timeZone: 'America/Chicago'
		}).format(time)
	);
}

function sumVolume(ticks: { volume: number }[]) {
	return ticks.reduce((total, tick) => total + tick.volume, 0);
}
