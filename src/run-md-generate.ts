import { isMainModule } from './shared/cli/is-main-module.ts';
import { runCli } from './shared/cli/run-cli.ts';

if (isMainModule(import.meta.url)) {
	try {
		await runCli(process.argv[2]);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
