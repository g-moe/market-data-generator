export function roundToTick(price: number, minTickSize: number) {
	return (
		Math.round(Math.round(price / minTickSize) * minTickSize * 1e10) / 1e10
	);
}
