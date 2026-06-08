import { join } from 'node:path';

import { getSymbolConfig } from '../contracts/symbols.ts';
import type { GenerationResult, GeneratorInputs } from '../contracts/types.ts';
import { buildCandles } from './candles.ts';
import { buildTicks } from './ticks.ts';

export function generateMarketData(inputs: GeneratorInputs): GenerationResult {
	const ticks = buildTicks(inputs);
	const candles = buildCandles(ticks, inputs);
	const symbolConfig = getSymbolConfig(inputs.symbol);

	return {
		candles,
		filePath: join(inputs.outputDir, `tradester_${symbolConfig.symbolId}.scid`),
		inputs,
		ticks
	};
}
