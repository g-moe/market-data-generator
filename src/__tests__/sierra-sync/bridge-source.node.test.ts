import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createBridgeSource } from '../../sierra-sync/bridge-source.ts';
import { SIERRA_DATA_DIR } from '../../sierra-sync/constants.ts';

const DEFAULT_METADATA = {
	timeframes: {
		'1s': { endTime: 1_760_000_060_000, startTime: 1_760_000_000_000 },
		daily: { endTime: 1_760_000_060_000, startTime: 1_760_000_000_000 },
		minutes5: { endTime: 1_760_000_060_000, startTime: 1_760_000_000_000 },
		range10: { endTime: 1_760_000_060_000, startTime: 1_760_000_000_000 },
		seconds15: { endTime: 1_760_000_060_000, startTime: 1_760_000_000_000 },
		tick100: { endTime: 1_760_000_060_000, startTime: 1_760_000_000_000 },
		volume500: { endTime: 1_760_000_060_000, startTime: 1_760_000_000_000 }
	}
};

async function withBridgeSource(
	test: (source: string) => Promise<void> | void,
	metadata: typeof DEFAULT_METADATA = DEFAULT_METADATA
) {
	const root = await mkdtemp(join(tmpdir(), 'sierra-bridge-'));
	const file = join(root, 'bars.csv');
	const metadataFile = join(root, 'tradester_ES.json');

	try {
		await writeFile(file, 'time,open,high,low,close,volume\n');
		await writeFile(metadataFile, JSON.stringify(metadata));
		const source = await createBridgeSource({
			files: {
				daily: file,
				metadata: metadataFile,
				minutes5: file,
				orderbook: join(root, 'tradester_ES_orderbook.depth'),
				priceLevel: file,
				range10: file,
				scid: join(root, 'tradester_ES.scid'),
				seconds15: file,
				tick100: file,
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
	it('uses the target SCID data file for every chart', async () => {
		const expectedDataFile = `${SIERRA_DATA_DIR.replaceAll('\\', '\\\\')}\\\\tradester_ES.scid`;

		await withBridgeSource((source) => {
			expect(source).toContain('SCString TargetDataFile()');
			expect(source).toContain(`return "${expectedDataFile}";`);
			expect(source).not.toContain('return "tradester_ES_1d"');
			expect(source).not.toContain('return "tradester_ES_5m"');
			expect(source).not.toContain('return "tradester_ES_15s"');
			expect(source).not.toContain('return "tradester_ES_10r"');
			expect(source).not.toContain('return "tradester_ES_100t"');
			expect(source).not.toContain('return "tradester_ES_500v"');
			expect(source).not.toContain('return "tradester_ES_1s_pl0.25"');
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

	it('uses generated metadata as the Sierra bridge date range source', async () => {
		await withBridgeSource(
			(source) => {
				expect(source).toContain('case 0: return DateYMD(2026, 1, 31);');
				expect(source).not.toContain('case 0: return DateYMD(1970, 1, 1);');
			},
			{
				timeframes: {
					'1s': { endTime: 1_769_904_000_000, startTime: 1_769_817_600_000 },
					daily: { endTime: 1_769_904_000_000, startTime: 1_769_817_600_000 },
					minutes5: { endTime: 1_769_904_000_000, startTime: 1_769_817_600_000 },
					range10: { endTime: 1_769_904_000_000, startTime: 1_769_817_600_000 },
					seconds15: { endTime: 1_769_904_000_000, startTime: 1_769_817_600_000 },
					tick100: { endTime: 1_769_904_000_000, startTime: 1_769_817_600_000 },
					volume500: { endTime: 1_769_904_000_000, startTime: 1_769_817_600_000 }
				}
			}
		);
	});
});
