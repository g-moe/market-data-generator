import { join } from 'node:path';

import { getTimeframes } from '../contracts/timeframes.ts';
import type { OutputFiles, TimeframeKey } from '../contracts/types.ts';
import type { Symbol } from '../contracts/symbols.ts';
import { getSymbolConfig } from '../contracts/symbols.ts';

export function getOutputFiles(symbol: Symbol, outputDir: string): OutputFiles {
	const symbolConfig = getSymbolConfig(symbol);
	const suffixes = getTimeframeSuffixes(symbol);
	const prefix = `tradester_${symbolConfig.symbolId}`;

	return {
		daily: join(outputDir, `${prefix}_${suffixes.daily}.csv`),
		metadata: join(outputDir, `${prefix}.json`),
		minutes5: join(outputDir, `${prefix}_${suffixes.minutes5}.csv`),
		orderbook: join(outputDir, 'depth'),
		priceLevel: join(outputDir, `${prefix}_${suffixes['1s']}.csv`),
		range10: join(outputDir, `${prefix}_${suffixes.range10}.csv`),
		scid: join(outputDir, `${prefix}.scid`),
		seconds15: join(outputDir, `${prefix}_${suffixes.seconds15}.csv`),
		tick100: join(outputDir, `${prefix}_${suffixes.tick100}.csv`),
		volume500: join(outputDir, `${prefix}_${suffixes.volume500}.csv`)
	};
}

function getTimeframeSuffixes(symbol: Symbol) {
	const suffixes = {} as Record<TimeframeKey, string>;

	for (const timeframe of getTimeframes(symbol)) {
		suffixes[timeframe.key] = timeframe.suffix;
	}

	return suffixes;
}
