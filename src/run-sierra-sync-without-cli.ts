import { formatProgressMessage } from './shared/cli/progress.ts';
import { runSierraSync } from './sierra-sync/sierra-sync.ts';

console.log('Running Sierra sync for ES...');

const result = await runSierraSync(
	{
		symbol: 'ES'
	},
	{
		onSessionComplete: (progress) => {
			const message = formatProgressMessage(progress);
			if (message !== undefined) console.log(message);
		}
	}
);

console.log(
	`Wrote ${result.generation.counts.ticks} ticks to ${result.generation.inputs.outputDir}`
);
console.log(`Wrote Sierra exports to ${result.outputDir}`);
