import type { PriceLevelTimeframeKey, TimeTimeframeKey } from '../../contracts/timeframes.ts';
import { TIMEFRAME_DEFINITIONS } from '../../contracts/timeframes.ts';
import type { GeneratorInputs } from '../../contracts/types.ts';
import type { GenerationSession } from '../pipeline/generation-pipeline.ts';
import { countGeneratedTickTimeBuckets } from '../tick-engine/session-ticks.ts';

type RetainedTimeframeKey = PriceLevelTimeframeKey | TimeTimeframeKey;

export type RetainedTimeWindow = {
	initialBarPosition: number;
	startSessionIndex: number;
};

export function createRetainedTimeWindow(
	key: RetainedTimeframeKey,
	inputs: GeneratorInputs,
	retainedBars: number
): RetainedTimeWindow {
	const bucketMs = TIMEFRAME_DEFINITIONS[key].milliseconds;
	const barsPerSession = countGeneratedTickTimeBuckets(inputs.ticksPerSession, bucketMs);
	const startSessionIndex = Math.max(
		0,
		inputs.sessionCount - Math.ceil(retainedBars / barsPerSession)
	);

	return {
		initialBarPosition: startSessionIndex * barsPerSession,
		startSessionIndex
	};
}

export function isSessionInRetainedTimeWindow(
	session: GenerationSession,
	window: RetainedTimeWindow
) {
	return session.generated && session.index >= window.startSessionIndex;
}
