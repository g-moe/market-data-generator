import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

type ExecCallback = (
	error: Error | null,
	result?: { stderr: string; stdout: string } | string,
	stderr?: string
) => void;

type ExecMock = (
	command: string,
	options: unknown,
	callback: ExecCallback
) => void;
type ExecFileMock = (
	file: string,
	args: string[],
	options: unknown,
	callback: ExecCallback
) => void;

const processCalls = vi.hoisted(() => ({
	exec: vi.fn<ExecMock>(),
	execFile: vi.fn<ExecFileMock>()
}));

vi.mock('node:child_process', () => processCalls);

import {
	buildSierraBridge,
	installSierraBridgeSource
} from '../../sierra-sync/bridge.ts';

describe('installSierraBridgeSource', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('materializes the repo bridge source into ACS_Source with the runtime export path', async () => {
		const root = await mkdtemp(join(tmpdir(), 'bridge-install-'));

		try {
			const bridgeSourcePath = join(
				root,
				'src-sierra-cpp',
				'tradester_sync_bridge.cpp'
			);
			const acsSourceDir = join(root, 'Sierra Chart', 'ACS_Source');
			await mkdir(join(root, 'src-sierra-cpp'), { recursive: true });
			await writeFile(
				bridgeSourcePath,
				'const char* path = "__TRADESTER_SIERRA_EXPORT_DIR__";'
			);

			const installedPath = await installSierraBridgeSource({
				acsSourceDir,
				bridgeSourcePath,
				latestOutputDir: 'C:\\data-out-temp\\ES\\latest\\"quoted"'
			});

			expect(installedPath).toBe(
				join(acsSourceDir, 'tradester_sync_bridge.cpp')
			);
			await expect(readFile(installedPath, 'utf8')).resolves.toContain(
				'quoted'
			);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});

describe('buildSierraBridge', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('releases Sierra DLLs, builds both architectures, cleans artifacts, and allows reload', async () => {
		const root = await mkdtemp(join(tmpdir(), 'bridge-build-'));

		try {
			mockSierraMessages();
			mockSuccessfulCompile();
			await writeFile('tradester_sync_bridge.obj', 'old artifact');

			const dllPaths = await buildSierraBridge({
				bridgeInstalledPath: join(
					root,
					'ACS_Source',
					'tradester_sync_bridge.cpp'
				),
				reloadDelayMs: 0,
				sierraDataDir: join(root, 'Data')
			});

			expect(dllPaths).toEqual([
				join(root, 'Data', 'tradester_sync_bridge_ARM64.dll'),
				join(root, 'Data', 'tradester_sync_bridge_64.dll')
			]);
			expect(processCalls.exec).toHaveBeenCalledTimes(2);
			expect(processCalls.execFile).toHaveBeenCalledTimes(2);
			await expect(
				readFile('tradester_sync_bridge.obj', 'utf8')
			).rejects.toMatchObject({
				code: 'ENOENT'
			});
		} finally {
			await rm(root, { force: true, recursive: true });
			await rm('tradester_sync_bridge.obj', { force: true });
		}
	});

	it('reuses existing DLLs when Sierra keeps them locked during rebuild', async () => {
		const root = await mkdtemp(join(tmpdir(), 'bridge-locked-'));

		try {
			mockSierraMessages();
			processCalls.exec.mockImplementation((_command, _options, callback) => {
				callback(
					Object.assign(new Error('link failed'), {
						stdout: 'LINK : fatal error LNK1104: cannot open file'
					})
				);
			});
			await mkdir(join(root, 'Data'), { recursive: true });
			await writeFile(
				join(root, 'Data', 'tradester_sync_bridge_ARM64.dll'),
				'existing'
			);
			await writeFile(
				join(root, 'Data', 'tradester_sync_bridge_64.dll'),
				'existing'
			);

			await expect(
				buildSierraBridge({
					bridgeInstalledPath: join(
						root,
						'ACS_Source',
						'tradester_sync_bridge.cpp'
					),
					reloadDelayMs: 0,
					sierraDataDir: join(root, 'Data')
				})
			).resolves.toEqual([
				join(root, 'Data', 'tradester_sync_bridge_ARM64.dll'),
				join(root, 'Data', 'tradester_sync_bridge_64.dll')
			]);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it('surfaces compiler output when the bridge build fails', async () => {
		const root = await mkdtemp(join(tmpdir(), 'bridge-failure-'));

		try {
			mockSierraMessages();
			processCalls.exec.mockImplementation((_command, _options, callback) => {
				callback(
					Object.assign(new Error('compile failed'), {
						stderr: 'compiler stderr',
						stdout: 'compiler stdout'
					})
				);
			});

			await expect(
				buildSierraBridge({
					bridgeInstalledPath: join(
						root,
						'ACS_Source',
						'tradester_sync_bridge.cpp'
					),
					reloadDelayMs: 0,
					sierraDataDir: join(root, 'Data')
				})
			).rejects.toThrow('compiler stdoutcompiler stderr');
			expect(processCalls.execFile).toHaveBeenCalledTimes(2);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});

function mockSierraMessages() {
	processCalls.execFile.mockImplementation(
		(_file, _args, _options, callback) => {
			callback(null, '', '');
		}
	);
}

function mockSuccessfulCompile() {
	processCalls.exec.mockImplementation((command, _options, callback) => {
		const output = /\/OUT:"([^"]+)"/.exec(command)?.[1];
		if (output === undefined) {
			callback(new Error('missing output'));
			return;
		}
		void mkdir(join(output, '..'), { recursive: true })
			.then(() => writeFile(output, 'dll'))
			.then(() => callback(null, { stderr: '', stdout: 'ok' }));
	});
}
