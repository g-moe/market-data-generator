export function createMarketSymbol(base: string, quote: string) {
	return `${base.toUpperCase()}/${quote.toUpperCase()}`
}
