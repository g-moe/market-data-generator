import { getSymbolConfig } from '../contracts/symbols.ts';
import type { GenerationResult } from '../contracts/types.ts';

export type SierraSyncRequest = {
	runId: string;
	requestedAt: string;
	symbol: string;
	symbolId: string;
	dataOutTempDir: string;
	generatedFiles: GenerationResult['files'];
	chartNames: Record<string, string>;
	exportFiles: Record<string, string>;
	useUtcTime: true;
	bridgeSourcePath: string;
	bridgeInstalledPath: string;
	bridgeDllPaths: string[];
};

export function createSierraSyncRequest({
	bridgeDllPaths,
	bridgeInstalledPath,
	bridgeSourcePath,
	dataOutTempDir,
	generation,
	requestedAt,
	runId
}: {
	bridgeDllPaths: string[];
	bridgeInstalledPath: string;
	bridgeSourcePath: string;
	dataOutTempDir: string;
	generation: GenerationResult;
	requestedAt: Date;
	runId: string;
}): SierraSyncRequest {
	const symbolConfig = getSymbolConfig(generation.inputs.symbol);
	return {
		bridgeDllPaths,
		bridgeInstalledPath,
		bridgeSourcePath,
		chartNames: {
			daily: `tradester_${symbolConfig.symbolId} 1 Day #5 L:1`,
			minutes5: `tradester_${symbolConfig.symbolId} 5 Min #4 L:1`,
			priceLevel: `tradester_${symbolConfig.symbolId} 1 Sec #1 L:1`,
			seconds15: `tradester_${symbolConfig.symbolId} 15 Sec #2 L:1`,
			volume500: `tradester_${symbolConfig.symbolId} 500 Volume #3 L:1`
		},
		dataOutTempDir,
		exportFiles: {
			daily: `tradester_${symbolConfig.symbolId}_1d_GraphData.txt`,
			minutes5: `tradester_${symbolConfig.symbolId}_5m_GraphData.txt`,
			priceLevel: `tradester_${symbolConfig.symbolId}_1s_GraphData.txt`,
			seconds15: `tradester_${symbolConfig.symbolId}_15s_GraphData.txt`,
			volume500: `tradester_${symbolConfig.symbolId}_500v_GraphData.txt`
		},
		generatedFiles: generation.files,
		requestedAt: requestedAt.toISOString(),
		runId,
		symbol: generation.inputs.symbol,
		symbolId: symbolConfig.symbolId,
		useUtcTime: true
	};
}
