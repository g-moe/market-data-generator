import { runSierraSync } from './sierra-sync.ts';
import { resolveSymbolArg } from '../shared/cli/symbol-args.ts';

export async function runSierraSyncCli(argv = process.argv.slice(2)) {
	const symbol = resolveSymbolArg(argv[0]);

	return runSierraSync(symbol);
}
