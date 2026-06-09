import { exec, execFile } from 'node:child_process';
import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
	SIERRA_BRIDGE_DLL_BASE_NAME,
	SIERRA_BRIDGE_FILE_NAME,
	VISUAL_STUDIO_BUILD_DIR
} from './constants.ts';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export type SierraBridgeBuildInputs = {
	bridgeInstalledPath: string;
	sierraDataDir: string;
};

export async function installSierraBridgeSource({
	acsSourceDir,
	bridgeSourcePath
}: {
	acsSourceDir: string;
	bridgeSourcePath: string;
}) {
	const bridgeInstalledPath = join(acsSourceDir, SIERRA_BRIDGE_FILE_NAME);
	await mkdir(acsSourceDir, { recursive: true });
	await copyFile(bridgeSourcePath, bridgeInstalledPath);
	return bridgeInstalledPath;
}

export async function buildSierraBridge({
	bridgeInstalledPath,
	sierraDataDir
}: SierraBridgeBuildInputs) {
	await mkdir(sierraDataDir, { recursive: true });
	await sendSierraMessage('RELEASE_ALL_DLLS');
	const builds = [
		{
			machine: 'ARM64' as const,
			output: join(sierraDataDir, `${SIERRA_BRIDGE_DLL_BASE_NAME}_ARM64.dll`),
			vcvars: 'vcvarsamd64_arm64.bat'
		},
		{
			machine: 'x64' as const,
			output: join(sierraDataDir, `${SIERRA_BRIDGE_DLL_BASE_NAME}_64.dll`),
			vcvars: 'vcvarsall.bat',
			vcvarsArg: 'amd64'
		}
	];
	try {
		for (const build of builds)
			await compileSierraBridge({ ...build, bridgeInstalledPath });
	} finally {
		await cleanSierraBridgeBuildArtifacts();
		await sendSierraMessage('ALLOW_LOAD_ALL_DLLS');
	}
	return builds.map((build) => build.output);
}

async function compileSierraBridge({
	bridgeInstalledPath,
	machine,
	output,
	vcvars,
	vcvarsArg
}: {
	bridgeInstalledPath: string;
	machine: 'ARM64' | 'x64';
	output: string;
	vcvars: string;
	vcvarsArg?: string;
}) {
	const vcvarsPath = join(VISUAL_STUDIO_BUILD_DIR, vcvars);
	const vcvarsCommand =
		vcvarsArg === undefined
			? `call "${vcvarsPath}"`
			: `call "${vcvarsPath}" ${vcvarsArg}`;
	const command = `${vcvarsCommand} && cl /JMC /MP /analyze- /Zc:wchar_t /Z7 /Od /GS /W3 /RTC1 /Zc:inline /D _WINDOWS /D _USRDLL /D _WINDLL /Gd /Gy /GR- /GF /fp:precise /MTd /std:c++17 /LD /EHa /WX- /diagnostics:classic /nologo "${bridgeInstalledPath}" /link Shell32.lib Gdi32.lib User32.lib /DLL /DYNAMICBASE /DEBUG /INCREMENTAL:NO /OPT:REF /MACHINE:${machine} /OUT:"${output}" 2>&1`;
	const { stdout, stderr } = await execAsync(command, {
		maxBuffer: 1024 * 1024 * 10,
		windowsHide: true
	});
	try {
		await stat(output);
	} catch {
		throw new Error(
			`Failed to build Sierra bridge ${machine} DLL at ${output}\n${stdout}${stderr}`
		);
	}
}

async function cleanSierraBridgeBuildArtifacts() {
	await Promise.all(
		[
			'tradester_sync_bridge.exp',
			'tradester_sync_bridge.lib',
			'tradester_sync_bridge.obj'
		].map(async (artifact) => {
			await rm(artifact, { force: true });
		})
	);
}

async function sendSierraMessage(message: string) {
	const script = [
		'$client = [System.Net.Sockets.UdpClient]::new()',
		`$bytes = [Text.Encoding]::ASCII.GetBytes('${message}')`,
		'$client.Send($bytes, $bytes.Length, "127.0.0.1", 22910) | Out-Null',
		'$client.Close()'
	].join('; ');
	await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
		windowsHide: true
	});
}
