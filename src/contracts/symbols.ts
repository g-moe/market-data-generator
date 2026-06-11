export const SYMBOL_CONFIG = {
	'/ES:XCME': {
		aliases: ['ES'],
		defaultStartPrice: 6000,
		id: '/ES:XCME',
		name: 'E-mini S&P 500',
		symbolId: 'ES',
		tickDecimals: 2,
		tickSize: 0.25,
		tickValue: 12.5
	},
	'/NQ:XCME': {
		aliases: ['NQ'],
		defaultStartPrice: 22_000,
		id: '/NQ:XCME',
		name: 'E-mini NASDAQ-100',
		symbolId: 'NQ',
		tickDecimals: 2,
		tickSize: 0.25,
		tickValue: 5
	}
} as const;

export type Symbol = keyof typeof SYMBOL_CONFIG;

export type SymbolConfig = (typeof SYMBOL_CONFIG)[Symbol];

export const SYMBOL_OPTIONS = Object.values(SYMBOL_CONFIG);

export const ALLOWED_SYMBOLS = Object.keys(SYMBOL_CONFIG) as Symbol[];

export function isAllowedSymbol(value: string): value is Symbol {
	return value in SYMBOL_CONFIG;
}

export function getSymbolConfig(symbol: Symbol): SymbolConfig {
	return SYMBOL_CONFIG[symbol];
}

export function findSymbol(value: string): Symbol | undefined {
	const normalized = value.trim().toUpperCase();
	const direct = ALLOWED_SYMBOLS.find((symbol) => symbol === normalized);
	if (direct !== undefined) return direct;

	return ALLOWED_SYMBOLS.find((symbol) => {
		const config = getSymbolConfig(symbol);

		return config.symbolId === normalized || config.aliases.some((alias) => alias === normalized);
	});
}
