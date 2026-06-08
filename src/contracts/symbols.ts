export const SYMBOL_CONFIG = {
	'/ES:XCME': {
		defaultStartPrice: 6000,
		id: '/ES:XCME',
		name: 'E-mini S&P 500',
		symbolId: 'ES',
		symbolSierra: 'ESM26-CME',
		tickDecimals: 2,
		tickSize: 0.25,
		tickValue: 12.5
	},
	'/NQ:XCME': {
		defaultStartPrice: 22_000,
		id: '/NQ:XCME',
		name: 'E-mini NASDAQ-100',
		symbolId: 'NQ',
		symbolSierra: 'NQM26-CME',
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
