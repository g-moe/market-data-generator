import { readFile, stat } from 'node:fs/promises';

import type {
	GenerationResult,
	GeneratorInputs,
	OutputFiles
} from '../contracts/types.ts';
import { getOutputFiles } from '../md-generation/generate-market-data.ts';

const SCID_HEADER_BYTES = 56;
const SCID_RECORD_BYTES = 40;

export async function loadExistingGenerationResult(
	inputs: GeneratorInputs
): Promise<GenerationResult> {
	const files = getOutputFiles(inputs);

	await assertRequiredFilesExist(files);

	return {
		counts: {
			daily: await countCsvRows(files.daily),
			minutes5: await countCsvRows(files.minutes5),
			priceLevel: await countCsvRows(files.priceLevel),
			seconds15: await countCsvRows(files.seconds15),
			ticks: await countScidRecords(files.scid),
			volume500: await countCsvRows(files.volume500)
		},
		files,
		inputs
	};
}

async function assertRequiredFilesExist(files: OutputFiles) {
	for (const filePath of Object.values(files)) {
		const fileStats = await stat(filePath).catch(() => undefined);

		if (fileStats === undefined || fileStats.size === 0) {
			throw new Error(
				`Sierra sync requires existing generated file before running: ${filePath}`
			);
		}
	}
}

async function countCsvRows(filePath: string) {
	const text = await readFile(filePath, 'utf8');
	const rows = text.trimEnd().split(/\r?\n/u);

	return Math.max(0, rows.length - 1);
}

async function countScidRecords(filePath: string) {
	const fileStats = await stat(filePath);
	const recordBytes = fileStats.size - SCID_HEADER_BYTES;

	if (recordBytes < 0 || recordBytes % SCID_RECORD_BYTES !== 0) {
		throw new Error(
			`Generated SCID file has an invalid byte length: ${filePath}`
		);
	}

	return recordBytes / SCID_RECORD_BYTES;
}
