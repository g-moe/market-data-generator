export const SYMBOL_CONFIG = {
	'/ES:XCME': {
		id: '/ES:XCME',
		symbolId: 'ES',
		name: 'E-mini S&P 500',
		tickDecimals: 2,
		tickSize: 0.25,
		tickValue: 12.5
	},
	'/NQ:XCME': {
		id: '/NQ:XCME',
		symbolId: 'NQ',
		name: 'E-mini NASDAQ-100',
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
