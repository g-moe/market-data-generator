import { SYMBOL_OPTIONS } from '../contracts/symbols.ts';
import { createNodePorts, type CliPorts } from '../shared/cli/run-cli.ts';
import { formatProgressMessage } from '../shared/cli/progress.ts';
import { runSierraSync, type RawSierraSyncInputs } from './sierra-sync.ts';

const SYMBOL_CHOICES = SYMBOL_OPTIONS.map((symbol) => ({
	description: `${symbol.name} (${symbol.id})`,
	label: symbol.symbolId,
	value: symbol.id
}));

type RunSierraSyncCliOptions = Omit<RawSierraSyncInputs, 'symbol'>;

export async function runSierraSyncCli(
	ports: CliPorts = createNodePorts(),
	options: RunSierraSyncCliOptions = {}
) {
	const symbol = await ports.select('Choose symbol', SYMBOL_CHOICES);
	const task = ports.spinner();

	task.start(`Running Sierra sync for ${symbol}...`);
	try {
		const result = await runSierraSync(
			{
				...options,
				symbol
			},
			{
				onSessionComplete: (progress) => {
					const message = formatProgressMessage(progress);
					if (message !== undefined) ports.log(message);
				}
			}
		);
		task.stop(`Wrote Sierra sync request to ${result.requestPath}`);

		return result;
	} catch (error) {
		task.error('Failed to run Sierra sync');
		throw error;
	}
}
