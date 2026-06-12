import type { GenerationProgress } from '../../contracts/types.ts';

const PROGRESS_SESSION_INTERVAL = 1000;

export function formatProgressMessage(progress: GenerationProgress) {
	if (!isProgressMilestone(progress)) {
		return undefined;
	}

	const start = Math.max(1, progress.completed - PROGRESS_SESSION_INTERVAL + 1);

	return `Completed sessions ${start}-${progress.completed} of ${progress.total}`;
}

export function isProgressMilestone(progress: GenerationProgress) {
	return (
		progress.completed % PROGRESS_SESSION_INTERVAL === 0 || progress.completed === progress.total
	);
}
