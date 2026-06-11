import { stat } from 'node:fs/promises';

import type { OutputFiles, Symbol } from '../contracts/index.ts';
import { getSymbolConfig } from '../contracts/symbols.ts';

const SIERRA_INPUT_FILE_KEYS = [
	'daily',
	'metadata',
	'minutes5',
	'priceLevel',
	'range10',
	'scid',
	'seconds15',
	'tick100',
	'volume500'
] as const satisfies readonly (keyof OutputFiles)[];

export async function assertInputDataExists(symbol: Symbol, files: OutputFiles) {
	const missing: string[] = [];

	for (const key of SIERRA_INPUT_FILE_KEYS) {
		const filePath = files[key];

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
		`Missing generated input data for ${config.symbolId}. Run: pnpm run run-md-generate ${config.symbolId}`
	);
}
