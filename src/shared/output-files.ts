import { join } from 'node:path';

import type { OutputFiles } from '../contracts/types.ts';
import type { Symbol } from '../contracts/symbols.ts';
import { getSymbolConfig } from '../contracts/symbols.ts';

export function getOutputFiles(symbol: Symbol, outputDir: string): OutputFiles {
	const symbolConfig = getSymbolConfig(symbol);
	const prefix = `tradester_${symbolConfig.symbolId}`;

	return {
		daily: join(outputDir, `${prefix}_1d.csv`),
		metadata: join(outputDir, `${prefix}.json`),
		minutes5: join(outputDir, `${prefix}_5m.csv`),
		priceLevel: join(
			outputDir,
			`${prefix}_1s_pl${formatPriceLevelSuffix(symbolConfig.tickSize)}.csv`
		),
		scid: join(outputDir, `${prefix}.scid`),
		seconds15: join(outputDir, `${prefix}_15s.csv`),
		volume500: join(outputDir, `${prefix}_500v.csv`)
	};
}

function formatPriceLevelSuffix(tickSize: number) {
	return String(tickSize);
}
