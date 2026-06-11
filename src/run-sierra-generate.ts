import { isMainModule } from './shared/cli/is-main-module.ts';
import { runSierraSyncCli } from './sierra-sync/run-sierra-sync-cli.ts';

if (isMainModule(import.meta.url)) {
	try {
		await runSierraSyncCli();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
