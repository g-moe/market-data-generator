import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createBridgeSource } from '../../sierra-sync/bridge-source.ts';

async function withBridgeSource(
	test: (source: string) => Promise<void> | void
) {
	const root = await mkdtemp(join(tmpdir(), 'sierra-bridge-'));
	const csv =
		'time,open,high,low,close,volume\n1760000000000,1,2,0,1.5,10\n1760000060000,1.5,3,1,2,12\n';
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
});
