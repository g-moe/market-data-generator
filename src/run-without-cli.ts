import { generateMarketData } from './domain/generate-market-data.ts';
import { normalizeInputs } from './domain/inputs.ts';
import { writeCandlesScid } from './io/scid.ts';

const inputs = normalizeInputs({
	candleInterval: 5,
	candleType: 'minute',
	symbol: '/ES:XCME'
});

console.log(
	`Generating SCID market data for ${inputs.symbol} ${inputs.candleInterval} ${inputs.candleType}...`
);

const result = generateMarketData(inputs);

await writeCandlesScid(result.filePath, result.candles);

console.log(`Wrote ${result.candles.length} candles to ${result.filePath}`);
