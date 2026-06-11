import { runSierraSync } from './sierra-sync.ts';

export async function runSierraSyncCli(argv = process.argv.slice(2)) {
	if (argv.length !== 1) throw new Error('Usage: pnpm run generate:sierra <symbol>');

	return runSierraSync(argv[0]);
}
