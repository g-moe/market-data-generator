import { isMainModule } from './cli/is-main-module.ts';
import { runCli } from './cli/run-cli.ts';

if (isMainModule(import.meta.url)) {
	try {
		await runCli();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
