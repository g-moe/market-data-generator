import { describe, expect, it } from 'vitest'

import { createMarketSymbol } from './index.js'

describe('createMarketSymbol', () => {
	it('formats a base and quote pair', () => {
		expect(createMarketSymbol('btc', 'usd')).toBe('BTC/USD')
	})
})
