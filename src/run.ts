export { runCli } from './cli/run-cli.ts';

if (import.meta.url === `file://${process.argv[1]}`) {
	const { runCli } = await import('./cli/run-cli.ts');

	try {
		await runCli();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
