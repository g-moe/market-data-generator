import { join } from 'node:path';

import { createTimeframeRecord, getTimeframe } from '../contracts/timeframes.ts';
import type { OutputFiles } from '../contracts/types.ts';
import type { Symbol } from '../contracts/symbols.ts';
import { getSymbolConfig } from '../contracts/symbols.ts';

export function getOutputFiles(symbol: Symbol, outputDir: string): OutputFiles {
	const symbolConfig = getSymbolConfig(symbol);
	const prefix = `tradester_${symbolConfig.symbolId}`;

	return {
		metadata: join(outputDir, `${prefix}.json`),
		orderbook: join(outputDir, 'depth'),
		scids: createTimeframeRecord((key) => {
			const timeframe = getTimeframe(symbol, key);

			return join(outputDir, `${prefix}_${timeframe.suffix}.scid`);
		}),
		timeframes: createTimeframeRecord((key) => {
			const timeframe = getTimeframe(symbol, key);

			return join(outputDir, `${prefix}_${timeframe.suffix}.csv`);
		})
	};
}
