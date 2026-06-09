export class RingBuffer<T> {
	private readonly items: Array<T | undefined>;
	private nextIndex = 0;
	private itemCount = 0;

	constructor(private readonly capacity: number) {
		if (!Number.isInteger(capacity) || capacity < 1) {
			throw new Error('capacity must be a positive integer');
		}

		this.items = Array.from<T | undefined>({ length: capacity });
	}

	get length() {
		return this.itemCount;
	}

	push(value: T) {
		this.items[this.nextIndex] = value;
		this.nextIndex = (this.nextIndex + 1) % this.capacity;
		this.itemCount = Math.min(this.itemCount + 1, this.capacity);
	}

	pushMany(values: T[]) {
		for (const value of values) {
			this.push(value);
		}
	}

	values() {
		const values: T[] = [];
		for (const value of this.iterate()) values.push(value);

		return values;
	}

	*iterate() {
		const start = this.itemCount === this.capacity ? this.nextIndex : 0;

		for (let offset = 0; offset < this.itemCount; offset++) {
			const value = this.items[(start + offset) % this.capacity];
			if (value !== undefined) yield value;
		}
	}
}
