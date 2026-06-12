export function createRandom(seed: number) {
	let state = seed >>> 0;

	return () => {
		state = (state * 1_664_525 + 1_013_904_223) >>> 0;

		return state / 0x1_0000_0000;
	};
}

export function randomSigned(random: () => number) {
	return random() * 2 - 1;
}
