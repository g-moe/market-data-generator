import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { Candle } from '../contracts/types.ts';
import { getUtcParts } from '../domain/market-time.ts';

export function serializeCandlesToCsv(candles: Candle[]) {
	const header =
		'Date,Time,Open,High,Low,Close,Volume,Number of Trades,Bid Volume,Ask Volume';

	const rows = candles.map((candle) => {
		const parts = getUtcParts(candle.time);

		return [
			parts.date,
			parts.time,
			candle.open,
			candle.high,
			candle.low,
			candle.close,
			candle.volume,
			candle.transactions,
			candle.bidVolume,
			candle.askVolume
		].join(',');
	});

	return [header, ...rows].join('\n');
}

export function hashOutput(output: string) {
	return createHash('sha256').update(output).digest('hex');
}

export async function writeCandlesCsv(filePath: string, candles: Candle[]) {
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, `${serializeCandlesToCsv(candles)}\n`, 'utf8');
}
