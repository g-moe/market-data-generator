import { stat } from 'node:fs/promises';

import type { OutputFiles, Symbol } from '../contracts/index.ts';
import { getSymbolConfig } from '../contracts/symbols.ts';

export async function assertInputDataExists(
	symbol: Symbol,
	files: OutputFiles
) {
	const missing: string[] = [];

	for (const filePath of Object.values(files)) {
		try {
			const result = await stat(filePath);
			if (!result.isFile()) missing.push(filePath);
		} catch {
			missing.push(filePath);
		}
	}

	if (missing.length === 0) return;

	const config = getSymbolConfig(symbol);
	throw new Error(
		`Missing generated input data for ${config.symbolId}. Run: pnpm run generate:without ${config.symbolId}`
	);
}
