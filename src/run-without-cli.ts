import { generateMarketData } from './domain/generate-market-data.ts';
import { normalizeInputs } from './domain/inputs.ts';
import { formatProgressMessage } from './cli/progress.ts';

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
