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
import {
	DEFAULT_DATA_OUT_TEMP_ROOT,
	SIERRA_BRIDGE_DLL_BASE_NAME,
	SIERRA_BRIDGE_FILE_NAME,
	SIERRA_BRIDGE_SOURCE_DIR,
	SIERRA_LATEST_RUN_NAME
} from '../../sierra-sync/constants.ts';

describe('installSierraBridgeSource', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('materializes the repo bridge source into ACS_Source with the runtime export path', async () => {
		const root = await mkdtemp(join(tmpdir(), 'bridge-install-'));

		try {
			const bridgeSourcePath = join(
				root,
				SIERRA_BRIDGE_SOURCE_DIR,
				SIERRA_BRIDGE_FILE_NAME
			);
			const acsSourceDir = join(root, 'Sierra Chart', 'ACS_Source');
			await mkdir(join(root, SIERRA_BRIDGE_SOURCE_DIR), { recursive: true });
			await writeFile(
				bridgeSourcePath,
				'const char* path = "__TRADESTER_SIERRA_EXPORT_DIR__";'
			);

			const installedPath = await installSierraBridgeSource({
				acsSourceDir,
				bridgeSourcePath,
				latestOutputDir: `C:\\${DEFAULT_DATA_OUT_TEMP_ROOT}\\ES\\${SIERRA_LATEST_RUN_NAME}\\"quoted"`
			});

			expect(installedPath).toBe(join(acsSourceDir, SIERRA_BRIDGE_FILE_NAME));
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
			await writeFile(`${SIERRA_BRIDGE_DLL_BASE_NAME}.obj`, 'old artifact');

			const dllPaths = await buildSierraBridge({
				bridgeInstalledPath: join(root, 'ACS_Source', SIERRA_BRIDGE_FILE_NAME),
				reloadDelayMs: 0,
				sierraDataDir: join(root, 'Data')
			});

			expect(dllPaths).toEqual([
				join(root, 'Data', `${SIERRA_BRIDGE_DLL_BASE_NAME}_ARM64.dll`),
				join(root, 'Data', `${SIERRA_BRIDGE_DLL_BASE_NAME}_64.dll`)
			]);
			expect(processCalls.exec).toHaveBeenCalledTimes(2);
			expect(processCalls.execFile).toHaveBeenCalledTimes(2);
			await expect(
				readFile(`${SIERRA_BRIDGE_DLL_BASE_NAME}.obj`, 'utf8')
			).rejects.toMatchObject({
				code: 'ENOENT'
			});
		} finally {
			await rm(root, { force: true, recursive: true });
			await rm(`${SIERRA_BRIDGE_DLL_BASE_NAME}.obj`, { force: true });
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
				join(root, 'Data', `${SIERRA_BRIDGE_DLL_BASE_NAME}_ARM64.dll`),
				'existing'
			);
			await writeFile(
				join(root, 'Data', `${SIERRA_BRIDGE_DLL_BASE_NAME}_64.dll`),
				'existing'
			);

			await expect(
				buildSierraBridge({
					bridgeInstalledPath: join(
						root,
						'ACS_Source',
						SIERRA_BRIDGE_FILE_NAME
					),
					reloadDelayMs: 0,
					sierraDataDir: join(root, 'Data')
				})
			).resolves.toEqual([
				join(root, 'Data', `${SIERRA_BRIDGE_DLL_BASE_NAME}_ARM64.dll`),
				join(root, 'Data', `${SIERRA_BRIDGE_DLL_BASE_NAME}_64.dll`)
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
						SIERRA_BRIDGE_FILE_NAME
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
