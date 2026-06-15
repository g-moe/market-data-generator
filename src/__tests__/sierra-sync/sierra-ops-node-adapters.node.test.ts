import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SierraOps } from '../../sierra-sync/sierra-ops.ts';

type ExecCall = {
	args: string[];
	file: string;
	options: Record<string, unknown> | undefined;
};

type MockedOpsContext = {
	execCalls: ExecCall[];
	ops: SierraOps;
	paths: ReturnType<typeof mockSierraOpsDependencies>['paths'];
};

afterEach(() => {
	vi.resetModules();
	vi.doUnmock('node:child_process');
	vi.doUnmock('../../sierra-sync/constants.ts');
});

describe('createNodeSierraOps node adapters', () => {
	it('installs and copies Sierra files through the configured data directories', async () => {
		await withMockedOps(async ({ ops, paths }) => {
			const bridgeTarget = await ops.installBridgeSource('bridge source');
			expect(bridgeTarget).toBe(join(paths.acsSourceDir, 'tradester_sync_bridge.cpp'));
			await expect(readFile(bridgeTarget, 'utf8')).resolves.toBe('bridge source');

			const sourceScid = join(paths.root, 'source.scid');
			await writeFile(sourceScid, 'SCID payload');

			const scidTarget = await ops.copyScid(sourceScid, 'tradester_ES_1d.scid');
			expect(scidTarget).toBe(join(paths.dataDir, 'tradester_ES_1d.scid'));
			await expect(readFile(scidTarget, 'utf8')).resolves.toBe('SCID payload');
			await expect(stat(`${scidTarget}.partial`)).rejects.toMatchObject({ code: 'ENOENT' });

			const chartbook = join(paths.root, 'source.Cht');
			await writeFile(chartbook, 'chartbook payload');

			const chartbookTarget = await ops.copyChartbook(chartbook);
			expect(chartbookTarget).toBe(join(paths.dataDir, '!tradester.Cht'));
			await expect(readFile(chartbookTarget, 'utf8')).resolves.toBe('chartbook payload');
		});
	});

	it('runs process operations through PowerShell and cmd without leaking scripts', async () => {
		await withMockedOps(async ({ execCalls, ops, paths }) => {
			await ops.closeSierra();
			expect(execCalls.at(-1)).toEqual({
				args: [
					'-NoProfile',
					'-Command',
					'Stop-Process -Name SierraChart_ARM64,SierraChart_64 -Force -ErrorAction SilentlyContinue; exit 0'
				],
				file: paths.powershellExe,
				options: undefined
			});

			await ops.installBridgeSource('bridge source');
			await ops.buildBridge();
			expect(execCalls.at(-1)).toEqual({
				args: ['/d', '/c', 'build_tradester_bridge.cmd'],
				file: 'cmd.exe',
				options: { cwd: paths.acsSourceDir }
			});
			await expect(
				stat(join(paths.acsSourceDir, 'build_tradester_bridge.cmd'))
			).rejects.toMatchObject({
				code: 'ENOENT'
			});

			await mkdir(paths.installDir, { recursive: true });
			await ops.openSierra();
			const launcher = join(paths.installDir, 'tradester-open-sierra.cmd');
			const launcherText = await readFile(launcher, 'utf8');
			const openCall = execCalls.at(-1);

			expect(launcherText).toContain(`cd /d "${paths.installDir}"`);
			expect(launcherText).toContain(`start "Sierra Chart" "${paths.sierraExePath}"`);
			expect(openCall?.file).toBe(paths.powershellExe);
			expect(openCall?.args[2]).toContain('Register-ScheduledTask');
			expect(openCall?.args[2]).toContain('Start-ScheduledTask');
		});
	});
});

async function withMockedOps(test: (context: MockedOpsContext) => Promise<void>) {
	const root = await mkdtemp(join(tmpdir(), 'sierra-ops-node-'));
	const { execCalls, paths } = mockSierraOpsDependencies(root);

	try {
		const { createNodeSierraOps } = await import('../../sierra-sync/sierra-ops.ts');

		await test({ execCalls, ops: createNodeSierraOps(), paths });
	} finally {
		vi.resetModules();
		await rm(root, { force: true, recursive: true });
	}
}

function mockSierraOpsDependencies(root: string) {
	const paths = {
		acsSourceDir: join(root, 'ACS_Source'),
		dataDir: join(root, 'Data'),
		installDir: join(root, 'Sierra Chart'),
		powershellExe: join(root, 'powershell.exe'),
		root,
		sierraExePath: join(root, 'Sierra Chart', 'SierraChart_ARM64.exe'),
		visualStudioBuildDir: join(root, 'Visual Studio Build')
	};
	const execCalls: ExecCall[] = [];

	vi.doMock('node:child_process', () => ({
		execFile: (
			file: string,
			args?: string[] | ((error: Error | null, stdout: string, stderr: string) => void),
			options?:
				| Record<string, unknown>
				| ((error: Error | null, stdout: string, stderr: string) => void),
			callback?: (error: Error | null, stdout: string, stderr: string) => void
		) => {
			const done =
				typeof args === 'function' ? args : typeof options === 'function' ? options : callback;

			execCalls.push({
				args: Array.isArray(args) ? args : [],
				file,
				options: typeof options === 'object' ? options : undefined
			});
			done?.(null, '', '');

			return {};
		}
	}));
	vi.doMock('../../sierra-sync/constants.ts', () => ({
		SIERRA_ACS_SOURCE_DIR: paths.acsSourceDir,
		SIERRA_BRIDGE_DLL_FILE_NAME: 'tradester_sync_bridge_ARM64.dll',
		SIERRA_BRIDGE_FILE_NAME: 'tradester_sync_bridge.cpp',
		SIERRA_CHARTBOOK_FILE_NAME: '!tradester.Cht',
		SIERRA_DATA_DIR: paths.dataDir,
		SIERRA_EXE_PATH: paths.sierraExePath,
		SIERRA_INSTALL_DIR: paths.installDir,
		SIERRA_LEGACY_PROCESS_NAME: 'SierraChart_64',
		SIERRA_OPEN_LAUNCHER_FILE_NAME: 'tradester-open-sierra.cmd',
		SIERRA_OPEN_TASK_NAME: 'TradesterOpenSierraInteractive',
		SIERRA_PROCESS_NAME: 'SierraChart_ARM64',
		SIERRA_WAIT_POLL_MS: 0,
		SIERRA_WAIT_TIMEOUT_MS: 10,
		VISUAL_STUDIO_BUILD_DIR: paths.visualStudioBuildDir,
		WINDOWS_POWERSHELL_EXE: paths.powershellExe
	}));

	return { execCalls, paths };
}
