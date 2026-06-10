import { execFile } from 'node:child_process';
import {
	copyFile,
	mkdir,
	readdir,
	rename,
	rm,
	stat,
	writeFile
} from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
	SIERRA_ACS_SOURCE_DIR,
	SIERRA_BRIDGE_DLL_FILE_NAME,
	SIERRA_BRIDGE_FILE_NAME,
	SIERRA_CHARTBOOK_FILE_NAME,
	SIERRA_DATA_DIR,
	SIERRA_EXE_PATH,
	SIERRA_INSTALL_DIR,
	SIERRA_LEGACY_PROCESS_NAME,
	SIERRA_OPEN_LAUNCHER_FILE_NAME,
	SIERRA_OPEN_TASK_NAME,
	SIERRA_PROCESS_NAME,
	SIERRA_WAIT_POLL_MS,
	SIERRA_WAIT_TIMEOUT_MS,
	VISUAL_STUDIO_BUILD_DIR,
	WINDOWS_POWERSHELL_EXE
} from './constants.ts';
import { nowEpochMs } from '../shared/datetime/index.ts';

const execFileAsync = promisify(execFile);
const SIERRA_SCID_COPY_TIMEOUT_MS = 10 * 60_000;

export type SierraOps = {
	cleanTempDir: (directory: string) => Promise<void>;
	closeSierra: () => Promise<void>;
	installBridgeSource: (source: string) => Promise<string>;
	buildBridge: () => Promise<void>;
	copyScid: (sourcePath: string, targetFileName: string) => Promise<string>;
	copyChartbook: (sourcePath: string) => Promise<string>;
	openSierra: () => Promise<void>;
	waitForFiles: (
		directory: string,
		fileNames: readonly string[],
		waitTimeout: number
	) => Promise<void>;
};

export function createNodeSierraOps(): SierraOps {
	return {
		buildBridge,
		cleanTempDir,
		closeSierra,
		copyChartbook,
		copyScid,
		installBridgeSource,
		openSierra,
		waitForFiles
	};
}

async function cleanTempDir(directory: string) {
	await rm(directory, { force: true, recursive: true });
	await mkdir(directory, { recursive: true });
}

async function closeSierra() {
	await execPowerShell(
		`Stop-Process -Name ${SIERRA_PROCESS_NAME},${SIERRA_LEGACY_PROCESS_NAME} -Force -ErrorAction SilentlyContinue; exit 0`
	);
}

async function installBridgeSource(source: string) {
	await mkdir(SIERRA_ACS_SOURCE_DIR, { recursive: true });
	const target = join(SIERRA_ACS_SOURCE_DIR, SIERRA_BRIDGE_FILE_NAME);
	await writeFile(target, source);

	return target;
}

async function buildBridge() {
	const scriptPath = join(SIERRA_ACS_SOURCE_DIR, 'build_tradester_bridge.cmd');
	await writeFile(
		scriptPath,
		`@echo off

call "${join(VISUAL_STUDIO_BUILD_DIR, 'vcvarsamd64_arm64.bat')}"

cl /JMC /MP /analyze- /Zc:wchar_t /Z7 /Od /GS /W3 /RTC1 /Zc:inline /D _WINDOWS /D _USRDLL /D _WINDLL /Gd /Gy /GR- /GF /fp:precise /MTd /std:c++17 /LD /EHa /WX- /diagnostics:classic /nologo ${SIERRA_BRIDGE_FILE_NAME} /link Shell32.lib Gdi32.lib User32.lib /DLL /DYNAMICBASE /DEBUG /INCREMENTAL:NO /OPT:REF /MACHINE:ARM64 /OUT:"${join(SIERRA_DATA_DIR, SIERRA_BRIDGE_DLL_FILE_NAME)}"


`
	);
	try {
		await execFileAsync('cmd.exe', ['/d', '/c', 'build_tradester_bridge.cmd'], {
			cwd: SIERRA_ACS_SOURCE_DIR
		});
	} finally {
		await rm(scriptPath, { force: true });
	}
}

async function copyScid(sourcePath: string, targetFileName: string) {
	await mkdir(SIERRA_DATA_DIR, { recursive: true });
	const target = join(SIERRA_DATA_DIR, targetFileName);
	const partialTarget = `${target}.partial`;

	await rm(partialTarget, { force: true });
	await rm(target, { force: true });
	await copyFile(sourcePath, partialTarget);
	await waitForCopiedFile(sourcePath, partialTarget);
	await rename(partialTarget, target);
	await waitForCopiedFile(sourcePath, target);

	return target;
}

async function waitForCopiedFile(sourcePath: string, targetPath: string) {
	const sourceSize = (await stat(sourcePath)).size;
	const deadline = nowEpochMs() + SIERRA_SCID_COPY_TIMEOUT_MS;
	let previous: { mtimeMs: number; size: number } | undefined;

	while (nowEpochMs() < deadline) {
		const target = await stat(targetPath).catch(() => undefined);
		const current = target && { mtimeMs: target.mtimeMs, size: target.size };
		if (
			current !== undefined &&
			current.size === sourceSize &&
			previous?.size === current.size &&
			previous.mtimeMs === current.mtimeMs
		)
			return;

		previous = current;
		await new Promise((resolve) => setTimeout(resolve, SIERRA_WAIT_POLL_MS));
	}

	throw new Error(`Timed out waiting for copied SCID to settle: ${targetPath}`);
}

async function copyChartbook(sourcePath: string) {
	await mkdir(SIERRA_DATA_DIR, { recursive: true });
	const target = join(SIERRA_DATA_DIR, SIERRA_CHARTBOOK_FILE_NAME);
	await copyFile(sourcePath, target);

	return target;
}

async function openSierra() {
	const launcherPath = join(SIERRA_INSTALL_DIR, SIERRA_OPEN_LAUNCHER_FILE_NAME);
	await writeFile(
		launcherPath,
		`@echo off

cd /d "${SIERRA_INSTALL_DIR}"

start "Sierra Chart" "${SIERRA_EXE_PATH}" "${join(SIERRA_DATA_DIR, SIERRA_CHARTBOOK_FILE_NAME)}"

`
	);
	await execPowerShell(
		`Unregister-ScheduledTask -TaskName "${SIERRA_OPEN_TASK_NAME}" -Confirm:$false -ErrorAction SilentlyContinue; ` +
			`$Action = New-ScheduledTaskAction -Execute "${launcherPath}" -WorkingDirectory "${SIERRA_INSTALL_DIR}"; ` +
			`$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5); ` +
			`$UserId = "$env:COMPUTERNAME\\$env:USERNAME"; ` +
			`$Principal = New-ScheduledTaskPrincipal -UserId $UserId -LogonType Interactive -RunLevel Limited; ` +
			`Register-ScheduledTask -TaskName "${SIERRA_OPEN_TASK_NAME}" -Action $Action -Trigger $Trigger -Principal $Principal -Force | Out-Null; ` +
			`Start-ScheduledTask -TaskName "${SIERRA_OPEN_TASK_NAME}"`
	);
}

async function waitForFiles(directory: string, fileNames: readonly string[]) {
	const deadline = nowEpochMs() + SIERRA_WAIT_TIMEOUT_MS;
	const stable = new Map<string, { mtimeMs: number; size: number }>();

	while (nowEpochMs() < deadline) {
		const names = new Set(await readdir(directory).catch(() => []));
		let allStable = true;

		for (const fileName of fileNames) {
			if (!names.has(fileName)) {
				allStable = false;
				break;
			}

			const current = await stat(join(directory, fileName));
			const previous = stable.get(fileName);
			stable.set(fileName, { mtimeMs: current.mtimeMs, size: current.size });
			if (
				previous === undefined ||
				previous.mtimeMs !== current.mtimeMs ||
				previous.size !== current.size
			)
				allStable = false;
		}

		if (allStable) return;
		await new Promise((resolve) => setTimeout(resolve, SIERRA_WAIT_POLL_MS));
	}

	throw new Error(`Timed out waiting for Sierra exports in ${directory}`);
}

async function execPowerShell(command: string) {
	await execFileAsync(WINDOWS_POWERSHELL_EXE, [
		'-NoProfile',
		'-Command',
		command
	]);
}
