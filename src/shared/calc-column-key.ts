import { z } from 'zod';

export type CalcColumnParam = {
	key: string;
	value: string;
};

export type CalcColumnKeyInput = {
	indicatorId: string;
	name: string;
	outputs: string[];
	params: CalcColumnParam[];
	timeframe: string;
};

export type ParsedCalcColumnName = {
	id: string;
	name: string;
	params: Record<string, string>;
	out: string;
	tf: string;
};

export type CalculationIndicator = {
	id: string;
	inputs: Record<string, string>;
	name: string;
	outputKeys: string[];
};

export type CalculationsJson = {
	indicators: CalculationIndicator[];
	symbol: string;
	timeframe: string;
};

const CALC_COLUMN_PREFIX = 'calc__';
const CALC_RESERVED_KEYS = new Set(['name', 'tf', 'id', 'out']);
const ALPHANUMERIC_MESSAGE = 'must contain only letters and numbers';

export const calcNameSchema = z
	.string()
	.trim()
	.min(1, 'name is required')
	.regex(/^[A-Za-z0-9]+$/u, `name ${ALPHANUMERIC_MESSAGE}`);

export const calcTimeframeSchema = z
	.string()
	.trim()
	.min(1, 'tf is required')
	.regex(
		/^(?:same|\d+(?:s|m|d|v|t))$/u,
		'tf must be same or a timeframe like 5m, 15s, 1d, 500v, or 100t'
	);

export const calcIndicatorIdSchema = z
	.string()
	.trim()
	.min(1, 'id is required')
	.regex(/^[A-Za-z0-9]+$/u, `id ${ALPHANUMERIC_MESSAGE}`);

export const calcOutputSchema = z
	.string()
	.trim()
	.min(1, 'out is required')
	.regex(/^[A-Za-z0-9]+$/u, `out ${ALPHANUMERIC_MESSAGE}`);

export const calcParamKeySchema = z
	.string()
	.trim()
	.min(1, 'param key is required')
	.regex(
		/^[A-Za-z][A-Za-z0-9]*$/u,
		'param key must start with a letter and contain only letters and numbers'
	)
	.refine((key) => !CALC_RESERVED_KEYS.has(key), {
		message: 'param key cannot be name, tf, id, or out'
	});

export const calcParamValueSchema = z
	.string()
	.trim()
	.min(1, 'param value is required')
	.refine((value) => !value.includes('__'), {
		message: 'param value cannot contain __'
	});

const calcColumnKeyInputSchema = z
	.object({
		indicatorId: calcIndicatorIdSchema,
		name: calcNameSchema,
		outputs: z.array(calcOutputSchema).min(1, 'At least one out key is required'),
		params: z.array(
			z.object({
				key: calcParamKeySchema,
				value: calcParamValueSchema
			})
		),
		timeframe: calcTimeframeSchema
	})
	.superRefine((input, context) => {
		const outputs = new Set<string>();
		for (let i = 0; i < input.outputs.length; i++) {
			const output = input.outputs[i];
			if (!outputs.has(output)) {
				outputs.add(output);
				continue;
			}

			context.addIssue({
				code: 'custom',
				message: `duplicate out key "${output}"`,
				path: ['outputs', i]
			});
		}

		const paramKeys = new Set<string>();
		for (let i = 0; i < input.params.length; i++) {
			const key = input.params[i].key;
			if (!paramKeys.has(key)) {
				paramKeys.add(key);
				continue;
			}

			context.addIssue({
				code: 'custom',
				message: `duplicate parameter key "${key}"`,
				path: ['params', i, 'key']
			});
		}
	});

export function buildCalcColumnKeys(input: CalcColumnKeyInput) {
	const validInput = parseWithSchema(calcColumnKeyInputSchema, input);

	return validInput.outputs.map((output) =>
		buildCalcColumnKey({
			indicatorId: validInput.indicatorId,
			name: validInput.name,
			output,
			params: validInput.params,
			timeframe: validInput.timeframe
		})
	);
}

export function buildCalculationIndicators(calcColumnKeys: string[]) {
	const indicators: CalculationIndicator[] = [];
	const byDefinition = new Map<
		string,
		{
			indicator: CalculationIndicator;
			outputs: Set<string>;
		}
	>();

	for (const key of calcColumnKeys) {
		const parsed = parseCalcColumnName(key);
		const inputs = buildCalculationInputs(parsed);
		const definitionKey = createCalculationDefinitionKey(parsed, inputs);
		const current = byDefinition.get(definitionKey);

		if (current === undefined) {
			const indicator = {
				id: parsed.id,
				inputs,
				name: parsed.name,
				outputKeys: [parsed.out]
			};

			indicators.push(indicator);
			byDefinition.set(definitionKey, {
				indicator,
				outputs: new Set([parsed.out])
			});
			continue;
		}

		if (current.outputs.has(parsed.out))
			throw new Error(`Duplicate calc output key "${parsed.out}" for indicator "${parsed.name}"`);

		current.indicator.outputKeys.push(parsed.out);
		current.outputs.add(parsed.out);
	}

	return indicators;
}

export function buildCalculationsJson({
	calcColumnKeys,
	symbol,
	timeframe
}: {
	calcColumnKeys: string[];
	symbol: string;
	timeframe: string;
}): CalculationsJson {
	return {
		indicators: buildCalculationIndicators(calcColumnKeys),
		symbol,
		timeframe
	};
}

export function parseCalcColumnName(columnName: string): ParsedCalcColumnName {
	return parseCalcColumnKey(columnName);
}

export function getZodValidationMessage(result: z.ZodSafeParseResult<unknown>) {
	return result.success ? undefined : result.error.issues[0]?.message;
}

export function isCalcColumnKey(header: string) {
	return header.startsWith(CALC_COLUMN_PREFIX);
}

export function validateCalcColumnKey(header: string) {
	parseCalcColumnKey(header);
}

function buildCalcColumnKey({
	indicatorId,
	name,
	output,
	params,
	timeframe
}: {
	indicatorId: string;
	name: string;
	output: string;
	params: CalcColumnParam[];
	timeframe: string;
}) {
	const key = `${CALC_COLUMN_PREFIX}${[
		`name:${name}`,
		`tf:${timeframe}`,
		`id:${indicatorId}`,
		...params.map((param) => `${param.key}:${param.value}`),
		`out:${output}`
	].join('__')}`;

	validateCalcColumnKey(key);

	return key;
}

function parseCalcColumnKey(header: string) {
	if (!isCalcColumnKey(header)) {
		throw new Error(`Invalid calc column "${header}": missing calc__ prefix`);
	}

	const segments = header.slice(CALC_COLUMN_PREFIX.length).split('__');

	const name = parseRequiredCalcPart(header, segments[0], 'name');
	const timeframe = parseRequiredCalcPart(header, segments[1], 'tf');
	const indicatorId = parseRequiredCalcPart(header, segments[2], 'id');
	const output = parseRequiredUniqueCalcOutput(header, segments.slice(3));

	parseCalcColumnValue(header, calcNameSchema, name);
	parseCalcColumnValue(header, calcTimeframeSchema, timeframe);
	parseCalcColumnValue(header, calcIndicatorIdSchema, indicatorId);
	parseCalcColumnValue(header, calcOutputSchema, output);

	const parsed: ParsedCalcColumnName = {
		id: indicatorId,
		name,
		out: output,
		params: {},
		tf: timeframe
	};
	const params = new Set<string>();
	for (const segment of segments.slice(3)) {
		const { key, value } = parseCalcKeyValue(header, segment, 'parameter');
		if (key === 'out') continue;
		if (CALC_RESERVED_KEYS.has(key))
			throw new Error(`Invalid calc column "${header}": duplicate ${key} segment`);

		parseCalcColumnValue(header, calcParamKeySchema, key);
		parseCalcColumnValue(header, calcParamValueSchema, value);

		if (params.has(key))
			throw new Error(`Invalid calc column "${header}": duplicate parameter key "${key}"`);

		params.add(key);
		parsed.params[key] = value;
	}

	return parsed;
}

function parseRequiredUniqueCalcOutput(header: string, segments: string[]) {
	let output: string | undefined;

	for (const segment of segments) {
		const { key, value } = parseCalcKeyValue(header, segment, 'parameter');
		if (key !== 'out') continue;

		if (output !== undefined)
			throw new Error(`Invalid calc column "${header}": duplicate out segment`);

		output = value;
	}

	if (output === undefined) throw new Error(`Invalid calc column "${header}": missing out segment`);

	return output;
}

function parseRequiredCalcPart(header: string, segment: string | undefined, expectedKey: string) {
	const { key, value } = parseCalcKeyValue(header, segment, `${expectedKey} segment`);

	if (key !== expectedKey)
		throw new Error(`Invalid calc column "${header}": expected ${expectedKey} segment`);

	return value;
}

function parseCalcKeyValue(header: string, segment: string | undefined, label: string) {
	if (segment === undefined || segment.length === 0)
		throw new Error(`Invalid calc column "${header}": missing ${label}`);

	const separatorIndex = segment.indexOf(':');
	if (separatorIndex <= 0 || separatorIndex === segment.length - 1)
		throw new Error(`Invalid calc column "${header}": malformed ${label}`);

	return {
		key: segment.slice(0, separatorIndex),
		value: segment.slice(separatorIndex + 1)
	};
}

function parseCalcColumnValue<TValue>(header: string, schema: z.ZodType<TValue>, value: unknown) {
	try {
		return parseWithSchema(schema, value);
	} catch (error) {
		throw new Error(
			`Invalid calc column "${header}": ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

function parseWithSchema<TValue>(schema: z.ZodType<TValue>, value: unknown) {
	const result = schema.safeParse(value);
	if (result.success) return result.data;

	throw new Error(result.error.issues[0]?.message ?? 'Invalid value');
}

function buildCalculationInputs(parsed: ParsedCalcColumnName) {
	return {
		tf: parsed.tf,
		...parsed.params
	};
}

function createCalculationDefinitionKey(
	parsed: ParsedCalcColumnName,
	inputs: Record<string, string>
) {
	const sortedInputs = Object.entries(inputs).sort(([left], [right]) => left.localeCompare(right));

	return JSON.stringify({
		id: parsed.id,
		inputs: sortedInputs,
		name: parsed.name
	});
}
