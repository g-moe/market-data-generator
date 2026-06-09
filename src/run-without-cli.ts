import { generateMarketData } from './domain/generate-market-data.ts';
import { normalizeInputs } from './domain/inputs.ts';

const inputs = normalizeInputs({
	symbol: 'ES'
});

console.log(`Generating market data for ${inputs.symbol}...`);

const result = await generateMarketData(inputs, {
	onSessionComplete: (progress) => {
		const message = formatProgressMessage(progress);
		if (message !== undefined) console.log(message);
	}
});

console.log(`Wrote ${result.counts.ticks} ticks to ${result.inputs.outputDir}`);

function formatProgressMessage(progress: { completed: number; total: number }) {
	if (progress.completed % 100 !== 0 && progress.completed !== progress.total) {
		return undefined;
	}

	const start = Math.max(1, progress.completed - 99);

	return `Completed sessions ${start}-${progress.completed} of ${progress.total}`;
}
