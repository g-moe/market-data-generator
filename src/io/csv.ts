import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { Candle } from '../contracts/types.ts';
import { getCentralParts } from '../domain/market-time.ts';

export function serializeCandlesToCsv(candles: Candle[]) {
	const rows = candles.map((candle) => {
		const parts = getCentralParts(candle.time);

		return [
			parts.date,
			parts.time,
			candle.open,
			candle.high,
			candle.low,
			candle.close,
			candle.volume,
			candle.bidVolume,
			candle.askVolume
		].join(',');
	});

	return [
		'Date,Time,Open,High,Low,Close,Volume,Bid Volume,Ask Volume',
		...rows
	].join('\n');
}

export async function writeCandlesCsv(filePath: string, candles: Candle[]) {
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, `${serializeCandlesToCsv(candles)}\n`, 'utf8');
}
