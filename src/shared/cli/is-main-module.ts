import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function isMainModule(importMetaUrl: string, argvPath = process.argv[1]) {
	if (argvPath === undefined) return false;

	return fileURLToPath(importMetaUrl) === resolve(argvPath);
}
