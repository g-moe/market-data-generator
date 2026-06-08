export function roundToTick(price: number, minTickSize: number) {
	return Number((Math.round(price / minTickSize) * minTickSize).toFixed(10));
}
