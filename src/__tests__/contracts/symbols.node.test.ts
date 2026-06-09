import { describe, expect, it } from 'vitest';

import { findSymbol, isAllowedSymbol } from '../../contracts/symbols.ts';

describe('symbols', () => {
	it('finds symbols by alias and full id', () => {
		expect(findSymbol('ES')).toBe('/ES:XCME');
		expect(findSymbol('/ES:XCME')).toBe('/ES:XCME');
		expect(findSymbol('YM')).toBeUndefined();
	});

	it('checks allowed full symbol ids', () => {
		expect(isAllowedSymbol('/ES:XCME')).toBe(true);
		expect(isAllowedSymbol('ES')).toBe(false);
	});
});
