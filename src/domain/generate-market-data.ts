import { join } from 'node:path';

import { getSymbolConfig } from '../contracts/index.ts';
import type { GenerationResult, GeneratorInputs } from '../contracts/index.ts';
import { buildCandles } from './candles.ts';
import { buildTicks } from './ticks.ts';

export function generateMarketData(inputs: GeneratorInputs): GenerationResult {
	const ticks = buildTicks(inputs);
	const candles = buildCandles(ticks, inputs);

	return {
		inputs,
		ticks,
		candles,
		filePath: join(
			inputs.outputDir,
			`${getSymbolConfig(inputs.symbol).symbolId}_${inputs.candleInterval}${inputs.candleType}.csv`.toLowerCase()
		)
	};
}
