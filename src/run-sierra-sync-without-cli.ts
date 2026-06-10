import { runSierraSync } from './sierra-sync/sierra-sync.ts';

console.log('Running Sierra sync for existing ES data...');

const result = await runSierraSync({
	symbol: 'ES'
});

console.log(
	`Loaded ${result.generation.counts.ticks} existing ticks from ${result.generation.inputs.outputDir}`
);
console.log(`Wrote Sierra exports to ${result.outputDir}`);
