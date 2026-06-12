import { describe, expect, it } from 'vitest';

import {
	GenerationPipeline,
	type GeneratedTick,
	type GenerationSession,
	type GenerationBuilder,
	type BuilderSummary
} from '../../../md-generation/pipeline/generation-pipeline.ts';

describe('GenerationPipeline', () => {
	it('fans session and tick events out to isolated builders in order', async () => {
		const first = new RecordingBuilder({
			timeframes: {
				'1d': {
					count: 1,
					range: { endTime: 20, startTime: 10 }
				}
			}
		});
		const second = new RecordingBuilder({
			orderbook: 7,
			timeframes: {
				'1s': {
					count: 2,
					range: { endTime: 40, startTime: 30 }
				}
			}
		});
		const session: GenerationSession = { generated: true, index: 3, start: 10 };
		const tick: GeneratedTick = {
			index: 0,
			price: 100,
			session,
			side: 'ask',
			time: 11,
			volume: 4
		};
		const pipeline = new GenerationPipeline([first, second]);

		await pipeline.open();
		await pipeline.startSession(session);
		pipeline.step(tick);
		await pipeline.finalizeSession(session);
		await pipeline.finish();
		await pipeline.close();

		expect(first.events).toEqual(['open', 'start:3', 'tick:0', 'finalize:3', 'finish', 'close']);
		expect(second.events).toEqual(first.events);
		expect(pipeline.summary()).toEqual({
			orderbook: 7,
			timeframes: {
				'1d': {
					count: 1,
					range: { endTime: 20, startTime: 10 }
				},
				'1s': {
					count: 2,
					range: { endTime: 40, startTime: 30 }
				}
			}
		});
	});

	it('routes primitive tick values and skips inactive builders', async () => {
		const activeValue = new ValueRecordingBuilder({}, true);
		const inactiveValue = new ValueRecordingBuilder({}, false);
		const objectBuilder = new RecordingBuilder({});
		const session: GenerationSession = { generated: true, index: 4, start: 100 };
		const pipeline = new GenerationPipeline([activeValue, inactiveValue, objectBuilder]);

		await pipeline.startSession(session);
		pipeline.stepValues(session, 2, 101, 6000.25, 9, 'bid');
		pipeline.step({
			index: 3,
			price: 6001,
			session,
			side: 'ask',
			time: 102,
			volume: 10
		});

		expect(activeValue.events).toEqual(['start:4', 'values:2:bid', 'values:3:ask']);
		expect(inactiveValue.events).toEqual(['start:4']);
		expect(objectBuilder.events).toEqual(['start:4', 'tick:2', 'tick:3']);
	});

	it('returns early from primitive tick routing when only value builders are active', async () => {
		const activeValue = new ValueRecordingBuilder({}, true);
		const pipeline = new GenerationPipeline([activeValue]);
		const session: GenerationSession = { generated: true, index: 5, start: 200 };

		await pipeline.startSession(session);
		pipeline.stepValues(session, 7, 201, 6002, 11, 'ask');

		expect(activeValue.events).toEqual(['start:5', 'values:7:ask']);
	});
});

class RecordingBuilder implements GenerationBuilder {
	readonly events: string[] = [];

	constructor(private readonly builderSummary: BuilderSummary) {}

	open() {
		this.events.push('open');
	}

	startSession(session: GenerationSession) {
		this.events.push(`start:${session.index}`);
	}

	step(tick: GeneratedTick) {
		this.events.push(`tick:${tick.index}`);
	}

	finalizeSession(session: GenerationSession) {
		this.events.push(`finalize:${session.index}`);
	}

	finish() {
		this.events.push('finish');
	}

	close() {
		this.events.push('close');
	}

	summary() {
		return this.builderSummary;
	}
}

class ValueRecordingBuilder extends RecordingBuilder {
	constructor(
		builderSummary: BuilderSummary,
		private readonly active: boolean
	) {
		super(builderSummary);
	}

	isTickActive() {
		return this.active;
	}

	stepValues(
		_session: GenerationSession,
		index: number,
		_time: number,
		_price: number,
		_volume: number,
		side: 'ask' | 'bid'
	) {
		this.events.push(`values:${index}:${side}`);
	}
}
