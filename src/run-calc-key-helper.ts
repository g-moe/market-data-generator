import { isMainModule } from './shared/cli/is-main-module.ts';
import { runCalcColumnKeyHelper } from './shared/cli/calc-column-key-helper.ts';

if (isMainModule(import.meta.url)) {
	try {
		await runCalcColumnKeyHelper();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
