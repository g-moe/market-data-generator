import {
	generateMarketData,
	normalizeInputs,
	writeCandlesCsv
} from './index.ts';

const inputs = normalizeInputs({
	symbol: '/ES:XCME',
	candleType: 'minute',
	candleInterval: 5
});

console.log(
	`Generating market data for ${inputs.symbol} ${inputs.candleInterval} ${inputs.candleType}...`
);

const result = generateMarketData(inputs);

await writeCandlesCsv(result.filePath, result.candles);

console.log(`Wrote ${result.candles.length} candles to ${result.filePath}`);
