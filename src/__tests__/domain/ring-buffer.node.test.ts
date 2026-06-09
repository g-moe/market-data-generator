import { describe, expect, it } from 'vitest';

import { RingBuffer } from '../../domain/ring-buffer.ts';

describe('RingBuffer', () => {
	it('keeps values in insertion order before capacity is reached', () => {
		const buffer = new RingBuffer<number>(3);

		buffer.push(1);
		buffer.push(2);

		expect(buffer.length).toBe(2);
		expect(buffer.values()).toEqual([1, 2]);
	});

	it('keeps only the latest values after capacity is reached', () => {
		const buffer = new RingBuffer<number>(3);

		buffer.pushMany([1, 2, 3, 4, 5]);

		expect(buffer.length).toBe(3);
		expect(buffer.values()).toEqual([3, 4, 5]);
	});

	it('rejects invalid capacity', () => {
		expect(() => new RingBuffer(0)).toThrow(/capacity/i);
	});
});
