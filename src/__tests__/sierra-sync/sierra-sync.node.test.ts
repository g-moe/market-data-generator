import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SierraOps } from '../../sierra-sync/sierra-ops.ts';

const assertInputDataExists = vi.fn<() => Promise<void>>();
const createBridgeSource = vi.fn<() => Promise<string>>();
const mergeValidatedSierraExports = vi.fn<() => Promise<object>>();

vi.mock('../../sierra-sync/input-data.ts', () => ({ assertInputDataExists }));
vi.mock('../../sierra-sync/bridge-source.ts', () => ({ createBridgeSource }));
vi.mock('../../sierra-sync/sierra-export.ts', () => ({ mergeValidatedSierraExports }));

const { runSierraSync } = await import('../../sierra-sync/sierra-sync.ts');

describe('runSierraSync', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('runs the Sierra sync steps in order with injected ops', async () => {
		await withProcessPlatform('win32', async () => {
			const calls: string[] = [];
			const ops: SierraOps = {
				buildBridge: vi.fn<() => Promise<void>>(async () => {
					calls.push('buildBridge');
				}),
				cleanTempDir: vi.fn<(directory: string) => Promise<void>>(async (directory) => {
					calls.push(`cleanTempDir:${directory}`);
				}),
				closeSierra: vi.fn<() => Promise<void>>(async () => {
					calls.push('closeSierra');
				}),
				copyChartbook: vi.fn<() => Promise<string>>(async () => {
					calls.push('copyChartbook');

					return 'installed-chartbook';
				}),
				copyScid: vi.fn<(sourcePath: string, targetFileName: string) => Promise<string>>(
					async (_sourcePath, targetFileName) => {
						calls.push(`copyScid:${targetFileName}`);

						return 'installed-scid';
					}
				),
				installBridgeSource: vi.fn<(source: string) => Promise<string>>(async (source) => {
					calls.push(`installBridgeSource:${source}`);

					return 'installed-bridge';
				}),
				openSierra: vi.fn<() => Promise<void>>(async () => {
					calls.push('openSierra');
				}),
				waitForFiles: vi.fn<(directory: string, fileNames: readonly string[]) => Promise<void>>(
					async (_directory, fileNames) => {
						calls.push(`waitForFiles:${fileNames.join('|')}`);
					}
				)
			};

			assertInputDataExists.mockResolvedValue(undefined);
			createBridgeSource.mockResolvedValue('bridge-source');
			mergeValidatedSierraExports.mockResolvedValue({});

			const logs: string[] = [];
			const inputDir = resolve('data-in', 'ES');
			const outputDir = resolve('data-out', 'ES');
			const tempDir = resolve('data-out-temp', 'ES');
			const result = await runSierraSync('/ES:XCME', {
				log: (message) => logs.push(message),
				ops
			});

			expect(result).toMatchObject({
				bridgeInstalledPath: 'installed-bridge',
				chartbookInstalledPath: 'installed-chartbook',
				inputDir,
				outputDir,
				scidInstalledPath: 'installed-scid',
				tempDir
			});
			expect(calls).toEqual([
				`cleanTempDir:${tempDir}`,
				`cleanTempDir:${outputDir}`,
				'closeSierra',
				'installBridgeSource:bridge-source',
				'buildBridge',
				'copyScid:tradester_ES.scid',
				'copyChartbook',
				'openSierra',
				'waitForFiles:tradester_ES_1d_GraphData.txt|tradester_ES_1s_GraphData.txt|tradester_ES_5m_GraphData.txt|tradester_ES_10r_GraphData.txt|tradester_ES_15s_GraphData.txt|tradester_ES_100t_GraphData.txt|tradester_ES_500v_GraphData.txt'
			]);
			expect(logs.at(0)).toBe('Checking data-in/ES');
			expect(mergeValidatedSierraExports).toHaveBeenCalledWith(
				expect.objectContaining({
					outputDir,
					symbol: '/ES:XCME',
					tempDir
				})
			);
		});
	});

	it('rejects unknown symbols on supported platforms', async () => {
		await withProcessPlatform('win32', async () => {
			await expect(runSierraSync('not-a-symbol', { log: () => undefined })).rejects.toThrow(
				'Unknown symbol: not-a-symbol'
			);
		});
	});
});

async function withProcessPlatform(platform: string, callback: () => Promise<void>) {
	const original = Object.getOwnPropertyDescriptor(process, 'platform');
	if (original === undefined) throw new Error('process.platform descriptor was not found');

	Object.defineProperty(process, 'platform', { value: platform });

	try {
		await callback();
	} finally {
		Object.defineProperty(process, 'platform', original);
	}
}
