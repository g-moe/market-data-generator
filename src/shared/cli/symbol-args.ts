import { SYMBOL_OPTIONS, findSymbol, type Symbol } from '../../contracts/symbols.ts';

const SYMBOL_OPTIONS_MESSAGE = ['Available symbols:', ...SYMBOL_OPTIONS.map(formatSymbolLine)].join(
	'\n'
);

function formatSymbolLine(symbol: (typeof SYMBOL_OPTIONS)[number]) {
	return `- ${symbol.symbolId} (${symbol.id}): ${symbol.name}`;
}

export function listSymbolOptions() {
	return SYMBOL_OPTIONS_MESSAGE;
}

export function resolveSymbolArg(rawSymbol: string | undefined): Symbol {
	const trimmedSymbol = rawSymbol?.trim();
	if (trimmedSymbol === undefined || trimmedSymbol === '') {
		throw new Error(`Symbol argument is required.\n${listSymbolOptions()}`);
	}

	const symbol = findSymbol(trimmedSymbol);
	if (symbol === undefined) {
		throw new Error(`Unknown symbol "${rawSymbol}".\n${listSymbolOptions()}`);
	}

	return symbol;
}
