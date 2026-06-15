import { createReadStream } from 'node:fs';

import type { OutputMetadata, TimeframeKey } from '../contracts/index.ts';
import { TIMEFRAME_DEFINITIONS, TIMEFRAME_KEYS } from '../contracts/timeframes.ts';
import {
	SCID_EPOCH_OFFSET_MS,
	SCID_HEADER_SIZE,
	SCID_RECORD_SIZE,
	ScidTickWriter
} from '../shared/file-ops/scid.ts';
import type { GenerationSession } from './pipeline/generation-pipeline.ts';

const VOLUME_BAR_SIZE = TIMEFRAME_DEFINITIONS['500v'].size;

type AlignedScidTarget = {
	key: TimeframeKey;
	startTime: number;
	writer: ScidTickWriter;
};

type ScidRecordValues = {
	askVolume: number;
	bidVolume: number;
	price: number;
	scDateTimeMs: number;
	time: number;
	volume: number;
};

type VolumeScidAlignment = {
	currentVolume: number;
	nextSessionIndex: number;
	sessionStarts: number[];
	started: boolean;
	target: AlignedScidTarget;
};

export async function writeAlignedScids({
	metadata,
	scids,
	sessions,
	ticksPerSession
}: {
	metadata: OutputMetadata;
	scids: Record<TimeframeKey, string>;
	sessions: readonly GenerationSession[];
	ticksPerSession: number;
}) {
	const sourceFile = scids['1d'];
	const targets = TIMEFRAME_KEYS.filter((key) => key !== '1d').map((key) => ({
		key,
		startTime: getTimeframeStartTime(metadata, key),
		writer: new ScidTickWriter(scids[key])
	}));

	await Promise.all(targets.map((target) => target.writer.open()));

	try {
		await writeAlignedRecords(
			sourceFile,
			targets,
			createVolumeScidAlignment(targets, sessions),
			getSourceStartOffset(targets, sessions, ticksPerSession)
		);
	} finally {
		await Promise.all(targets.map((target) => target.writer.close()));
	}
}

async function writeAlignedRecords(
	sourceFile: string,
	targets: AlignedScidTarget[],
	volumeAlignment: VolumeScidAlignment,
	sourceStartOffset: number
) {
	let remainder: Buffer<ArrayBufferLike> = Buffer.alloc(0);

	for await (const chunk of createReadStream(sourceFile, { start: sourceStartOffset })) {
		const data = appendRemainder(remainder, chunk);
		const usableLength = data.length - (data.length % SCID_RECORD_SIZE);

		for (let offset = 0; offset < usableLength; offset += SCID_RECORD_SIZE) {
			writeRecordToTargets(data, offset, targets, volumeAlignment);
		}

		remainder = usableLength === data.length ? Buffer.alloc(0) : data.subarray(usableLength);
	}

	if (remainder.length !== 0) {
		throw new Error(`Invalid SCID record boundary in ${sourceFile}`);
	}
}

function appendRemainder(
	remainder: Buffer<ArrayBufferLike>,
	chunk: string | Buffer<ArrayBufferLike>
) {
	const data = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
	if (remainder.length === 0) return data;

	return Buffer.concat([remainder, data]);
}

function writeRecordToTargets(
	data: Buffer<ArrayBufferLike>,
	offset: number,
	targets: AlignedScidTarget[],
	volumeAlignment: VolumeScidAlignment
) {
	const record = readRecordValues(data, offset);

	for (const target of targets) {
		if (target.key === '500v') continue;
		if (record.time < target.startTime) continue;

		writeRecordValues(target.writer, record);
	}

	writeVolumeRecordToTarget(record, volumeAlignment);
}

function readRecordValues(data: Buffer<ArrayBufferLike>, offset: number): ScidRecordValues {
	const scDateTimeMs = Number(data.readBigInt64LE(offset));

	return {
		askVolume: data.readUInt32LE(offset + 36),
		bidVolume: data.readUInt32LE(offset + 32),
		price: data.readFloatLE(offset + 20),
		scDateTimeMs,
		time: Math.floor(scDateTimeMs / 1000) + SCID_EPOCH_OFFSET_MS,
		volume: data.readUInt32LE(offset + 28)
	};
}

function writeVolumeRecordToTarget(record: ScidRecordValues, alignment: VolumeScidAlignment) {
	advanceVolumeSession(record.time, alignment);

	if (alignment.started) {
		writeRecordValues(alignment.target.writer, record);

		return;
	}

	if (record.time < alignment.target.startTime) {
		consumeVolume(record.volume, alignment);

		return;
	}

	// A retained 500v bar can start inside one generated trade after the previous bar
	// consumed part of that trade; Sierra must see only the remaining volume.
	const consumedVolume =
		alignment.currentVolume === 0 ? 0 : VOLUME_BAR_SIZE - alignment.currentVolume;
	if (consumedVolume >= record.volume) {
		consumeVolume(record.volume, alignment);

		return;
	}

	writeRecordValues(alignment.target.writer, {
		...record,
		askVolume: record.askVolume > 0 ? record.volume - consumedVolume : 0,
		bidVolume: record.bidVolume > 0 ? record.volume - consumedVolume : 0,
		volume: record.volume - consumedVolume
	});
	alignment.started = true;
}

function advanceVolumeSession(time: number, alignment: VolumeScidAlignment) {
	while (
		alignment.nextSessionIndex < alignment.sessionStarts.length &&
		time >= alignment.sessionStarts[alignment.nextSessionIndex]
	) {
		alignment.currentVolume = 0;
		alignment.nextSessionIndex++;
	}
}

function consumeVolume(volume: number, alignment: VolumeScidAlignment) {
	let remaining = volume;

	while (remaining > 0) {
		const consumed = Math.min(remaining, VOLUME_BAR_SIZE - alignment.currentVolume);
		alignment.currentVolume += consumed;
		remaining -= consumed;

		if (alignment.currentVolume === VOLUME_BAR_SIZE) {
			alignment.currentVolume = 0;
		}
	}
}

function writeRecordValues(writer: ScidTickWriter, record: ScidRecordValues) {
	writer.pushScDateTimeMsVolumeValues(
		record.scDateTimeMs,
		record.price,
		record.volume,
		record.bidVolume,
		record.askVolume
	);
}

function createVolumeScidAlignment(
	targets: AlignedScidTarget[],
	sessions: readonly GenerationSession[]
): VolumeScidAlignment {
	const target = targets.find((candidate) => candidate.key === '500v');
	if (target === undefined) {
		throw new Error('Missing 500v SCID target');
	}

	return {
		currentVolume: 0,
		nextSessionIndex: 0,
		sessionStarts: sessions
			.filter((session) => session.generated)
			.map((session) => session.start)
			.sort((a, b) => a - b),
		started: false,
		target
	};
}

function getSourceStartOffset(
	targets: AlignedScidTarget[],
	sessions: readonly GenerationSession[],
	ticksPerSession: number
) {
	const earliestStartTime = Math.min(...targets.map((target) => target.startTime));
	let recordsBeforeSession = 0;
	let retainedSessionRecordsBefore = 0;

	for (const session of sessions) {
		if (!session.generated) continue;
		if (session.start > earliestStartTime) break;

		retainedSessionRecordsBefore = recordsBeforeSession;
		recordsBeforeSession += ticksPerSession;
	}

	return SCID_HEADER_SIZE + retainedSessionRecordsBefore * SCID_RECORD_SIZE;
}

function getTimeframeStartTime(metadata: OutputMetadata, key: TimeframeKey) {
	const timeframe = metadata.timeframes[key];
	if (timeframe === undefined) {
		throw new Error(`Generated metadata is missing timeframe range: ${key}`);
	}

	return timeframe.startTime;
}
