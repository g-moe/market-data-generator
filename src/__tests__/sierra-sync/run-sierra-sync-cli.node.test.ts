import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { CliPorts } from '../../shared/cli/run-cli.ts';
import { sierraExportFiles } from '../../sierra-sync/outputs.ts';
import { DEFAULT_OUTPUT_ROOT } from '../../contracts/defaults.ts';
import {
	DEFAULT_DATA_OUT_ROOT,
	DEFAULT_DATA_OUT_TEMP_ROOT,
	SIERRA_BRIDGE_FILE_NAME,
	SIERRA_GRAPH_DATA_HEADER,
	SIERRA_LATEST_RUN_NAME
} from '../../sierra-sync/constants.ts';
import { runSierraSyncCli } from '../../sierra-sync/run-sierra-sync-cli.ts';
import { formatSierraGraphDataDateTime } from '../../sierra-sync/validation.ts';

const GENERATED_TIME = Date.UTC(2026, 5, 9, 18, 0, 4);
const CANDLE_HEADER =
	'id,time,pos,open,high,low,close,volume,bidVolume,askVolume,vwap';
const PRICE_LEVEL_HEADER = `${CANDLE_HEADER},prices`;
const GENERATED_ROW = `${GENERATED_TIME.toString()}000000,${GENERATED_TIME.toString()},0,4330,4331,4329,4330.5,12,12,0,4330.5`;
const GENERATED_PRICE_LEVEL_ROW = `${GENERATED_ROW},4330.5:12`;

describe('runSierraSyncCli', () => {
	it('asks for a run name and uses it as the named output run', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-cli-'));
		const bridgeSourcePath = join(root, SIERRA_BRIDGE_FILE_NAME);
		const latestOutputDir = join(
			root,
			DEFAULT_DATA_OUT_TEMP_ROOT,
			'ES',
			SIERRA_LATEST_RUN_NAME
		);
		const generatedPriceLevelFile = join(
			root,
			DEFAULT_OUTPUT_ROOT,
			'ES',
			'tradester_ES_1s_pl0.25.csv'
		);
		const events: string[] = [];

		try {
			await writeFile(bridgeSourcePath, '// bridge');
			await writeGeneratedFiles(join(root, DEFAULT_OUTPUT_ROOT, 'ES'));

			const result = await runSierraSyncCli(
				ports({
					events,
					generatedPriceLevelFile,
					latestOutputDir,
					promptAnswers: ['validation-run'],
					selectAnswers: ['ES']
				}),
				{
					bridgeSourcePath,
					buildSierraBridge: false,
					dataInRoot: join(root, DEFAULT_OUTPUT_ROOT),
					dataOutRoot: join(root, DEFAULT_DATA_OUT_ROOT),
					dataOutTempRoot: join(root, DEFAULT_DATA_OUT_TEMP_ROOT),
					exportPollIntervalMs: 5,
					exportTimeoutMs: 500,
					sessionCount: 1,
					ticksPerSession: 5
				}
			);

			expect(events).toContain('select:Choose symbol');
			expect(events).toContain('prompt:Run name');
			expect(result.latestOutputDir).toBe(latestOutputDir);
			expect(result.outputDir).toBe(
				join(root, DEFAULT_DATA_OUT_ROOT, 'ES', 'validation-run')
			);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	}, 10_000);
});

function ports({
	events,
	generatedPriceLevelFile,
	latestOutputDir,
	promptAnswers,
	selectAnswers
}: {
	events: string[];
	generatedPriceLevelFile: string;
	latestOutputDir: string;
	promptAnswers: string[];
	selectAnswers: string[];
}): CliPorts {
	return {
		log: (message) => {
			events.push(`log:${message}`);
		},
		prompt: async (message) => {
			events.push(`prompt:${message}`);

			return promptAnswers.shift() ?? '';
		},
		select: async (message) => {
			events.push(`select:${message}`);

			return selectAnswers.shift() ?? '';
		},
		spinner: () => ({
			error: (message) => {
				events.push(`error:${message}`);
			},
			start: (message) => {
				events.push(`start:${message}`);
				setTimeout(
					() =>
						void writeLatestFiles({ generatedPriceLevelFile, latestOutputDir }),
					25
				);
			},
			stop: (message) => {
				events.push(`stop:${message}`);
			}
		})
	};
}

async function writeGeneratedFiles(outputDir: string) {
	await mkdir(outputDir, { recursive: true });
	await writeFile(join(outputDir, 'tradester_ES.scid'), Buffer.alloc(96));
	await writeFile(
		join(outputDir, 'tradester_ES_1s_pl0.25.csv'),
		`${PRICE_LEVEL_HEADER}\n${GENERATED_PRICE_LEVEL_ROW}\n`
	);

	await Promise.all(
		[
			'tradester_ES_1d.csv',
			'tradester_ES_5m.csv',
			'tradester_ES_15s.csv',
			'tradester_ES_500v.csv'
		].map((fileName) =>
			writeFile(
				join(outputDir, fileName),
				`${CANDLE_HEADER}\n${GENERATED_ROW}\n`
			)
		)
	);
}

async function writeLatestFiles({
	generatedPriceLevelFile,
	latestOutputDir
}: {
	generatedPriceLevelFile: string;
	latestOutputDir: string;
}) {
	const generatedRows = (await readFile(generatedPriceLevelFile, 'utf8'))
		.trimEnd()
		.split(/\r?\n/u)
		.slice(1);
	const sierraRows = generatedRows.map((generatedRow) => {
		const [, time, , open, high, low, close, volume, bidVolume, askVolume] =
			generatedRow.split(',');
		const { clock, date } = formatSierraGraphDataDateTime(Number(time));

		return [
			date,
			clock,
			open,
			high,
			low,
			close,
			volume,
			'1',
			close,
			close,
			close,
			bidVolume,
			askVolume
		].join(', ');
	});
	const exportFiles = sierraExportFiles('/ES:XCME');

	await mkdir(latestOutputDir, { recursive: true });
	await Promise.all(
		Object.entries(exportFiles).map(([key, fileName]) =>
			writeFile(
				join(latestOutputDir, fileName),
				key === 'priceLevel'
					? [SIERRA_GRAPH_DATA_HEADER, ...sierraRows, ''].join('\n')
					: fileName
			)
		)
	);
}
