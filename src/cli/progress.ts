export type GenerationProgress = {
	completed: number;
	total: number;
};

export function formatProgressMessage(progress: GenerationProgress) {
	if (progress.completed % 100 !== 0 && progress.completed !== progress.total) {
		return undefined;
	}

	const start = Math.max(1, progress.completed - 99);

	return `Completed sessions ${start}-${progress.completed} of ${progress.total}`;
}
