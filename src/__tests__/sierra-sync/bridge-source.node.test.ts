import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as fsPromises from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';

import { SIERRA_BRIDGE_FILE_NAME, SIERRA_SOURCE_ROOT } from '../../sierra-sync/constants.ts';

const DEFAULT_CSV =
	'time,open,high,low,close,volume\n1760000000000,1,2,0,1.5,10\n1760000060000,1.5,3,1,2,12\n';

async function withBridgeSource(
	test: (source: string) => Promise<void> | void,
	csv: string = DEFAULT_CSV
) {
	const { createBridgeSource } = await import('../../sierra-sync/bridge-source.ts');
	const root = await mkdtemp(join(tmpdir(), 'sierra-bridge-'));
	const file = join(root, 'bars.csv');

	try {
		await writeFile(file, csv);
		const source = await createBridgeSource({
			files: {
				daily: file,
				minutes5: file,
				priceLevel: file,
				scid: join(root, 'tradester_ES.scid'),
				seconds15: file,
				volume500: file
			},
			symbol: '/ES:XCME',
			tempDir: join(root, 'temp')
		});

		await test(source);
	} finally {
		await rm(root, { force: true, recursive: true });
	}
}

describe('createBridgeSource', () => {
	it('uses the chartbook tick SCID symbol for every chart', async () => {
		await withBridgeSource((source) => {
			expect(source).toContain('const char* TargetSymbol()');
			expect(source).toContain('return "tradester_ES";');
			expect(source).not.toContain('return "tradester_ES_1d"');
			expect(source).not.toContain('return "tradester_ES_5m"');
			expect(source).not.toContain('return "tradester_ES_15s"');
			expect(source).not.toContain('return "tradester_ES_500v"');
			expect(source).not.toContain('return "tradester_ES_1s_pl0.25"');
			expect(source).not.toContain('return "/ES:XCME"');
		});
	});

	it('uses Sierra internal date values instead of raw yyyymmdd integers', async () => {
		await withBridgeSource((source) => {
			expect(source).toContain('date.SetDateYMD(year, month, day);');
			expect(source).toContain('case 0: return DateYMD(2025, 10, 9);');
			expect(source).not.toContain('case 0: return 20251009;');
			expect(source).not.toContain('if (time <= 0)');
			expect(source).not.toContain('IntradayChartBarPeriodParameter1 = 86400');
			expect(source).toContain('exportComplete = 0;');
		});
	});

	it('matches Sierra daily charts as historical daily or 1440 minute intraday bars', async () => {
		await withBridgeSource((source) => {
			expect(source).toContain('barPeriod.ChartDataType == DAILY_DATA');
			expect(source).toContain('IntradayChartBarPeriodParameter1 == 1440 * 60');
			expect(source).toContain('return "tradester_ES_1d_GraphData.txt";');
		});
	});

	it('maps each timeframe condition branch', async () => {
		await withBridgeSource((source) => {
			expect(source).toContain('IBPT_VOLUME_PER_BAR');
			expect(source).toContain('IntradayChartBarPeriodParameter1 == 500');
			expect(source).toContain('IntradayChartBarPeriodParameter1 == 1');
			expect(source).toContain('IntradayChartBarPeriodParameter1 == 5 * 60');
			expect(source).toContain('IntradayChartBarPeriodParameter1 == 15');
		});
	});

	it('uses first non-zero bar as Sierra bridge start time when zero-padding exists', async () => {
		await withBridgeSource((source) => {
			expect(source).toContain('case 0: return DateYMD(2025, 10, 9);');
			expect(source).not.toContain('case 0: return DateYMD(1970, 1, 1);');
		}, 'time,open,high,low,close,volume\n0,0,0,0,0,0\n1760000000000,1,2,0,1.5,10\n');
	});

	it('throws when generated data is empty', async () => {
		await expect(
			withBridgeSource(() => {
				/* unreachable */
			}, 'time,open,high,low,close,volume\n')
		).rejects.toThrow('Cannot derive Sierra date range from empty file');
	});

	it('throws when generated data is missing the time column', async () => {
		await expect(
			withBridgeSource(() => {
				/* unreachable */
			}, 'open,high,low,close,volume\n1,2,0,1.5,10\n')
		).rejects.toThrow('Generated file is missing time column');
	});

	it('throws when all generated rows are padding rows', async () => {
		await expect(
			withBridgeSource(() => {
				/* unreachable */
			}, 'time,open,high,low,close,volume\n0,0,0,0,0,0\n')
		).rejects.toThrow('No valid Sierra date range available in generated file');
	});

	it('throws when a bridge template token is not replaced', async () => {
		const actualReadFile = (await vi.importActual<typeof fsPromises>('node:fs/promises')).readFile;
		vi.resetModules();
		const readFileMock = vi.fn<
			(
				path: string,
				encoding?: Parameters<typeof actualReadFile>[1]
			) => ReturnType<typeof actualReadFile>
		>(async (path: string, encoding: Parameters<typeof actualReadFile>[1] = undefined) => {
			if (path.endsWith(`${SIERRA_SOURCE_ROOT}/${SIERRA_BRIDGE_FILE_NAME}`)) {
				return 'missing token __TRADESTER_TARGET_SYMBOL__ remains';
			}

			return actualReadFile(path, encoding);
		});

		vi.doMock('node:fs/promises', async () => ({
			...(await vi.importActual('node:fs/promises')),
			readFile: readFileMock
		}));

		try {
			await expect(
				withBridgeSource(() => {
					/* unreachable */
				})
			).rejects.toThrow('Missing Sierra bridge token replacement');
		} finally {
			vi.resetModules();
		}
	});
});
