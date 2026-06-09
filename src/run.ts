import { runCli } from './cli/run-cli.ts';

export { runCli };

if (import.meta.url === `file://${process.argv[1]}`) {
	try {
		await runCli();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
