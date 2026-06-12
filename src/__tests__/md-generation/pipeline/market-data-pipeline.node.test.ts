import { describe, expect, it } from 'vitest';

import { getSymbolConfig } from '../../../contracts/symbols.ts';
import { getOutputFiles } from '../../../md-generation/generate-market-data.ts';
import { normalizeInputs } from '../../../md-generation/inputs.ts';
import { createMarketDataPipeline } from '../../../md-generation/pipeline/market-data-pipeline.ts';
import type { GenerationSession } from '../../../md-generation/pipeline/generation-pipeline.ts';

describe('createMarketDataPipeline', () => {
	it('ignores object ticks for non-generated sessions', async () => {
		const inputs = normalizeInputs({
			outputDir: 'tmp/market-data-pipeline-test',
			sessionCount: 1,
			symbol: 'ES',
			ticksPerSession: 1
		});
		const session: GenerationSession = {
			generated: false,
			index: 0,
			start: -1
		};
		const pipeline = createMarketDataPipeline({
			files: getOutputFiles(inputs),
			inputs,
			sessionStarts: [session],
			symbolConfig: getSymbolConfig(inputs.symbol)
		});

		expect(() =>
			pipeline.step({
				index: 0,
				price: inputs.startPrice,
				session,
				side: 'ask',
				time: 0,
				volume: 1
			})
		).not.toThrow();
	});
});
