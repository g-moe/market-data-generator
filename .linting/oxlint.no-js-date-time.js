const MESSAGE =
	'Built-in date/time APIs are banned. Use shared datetime utils or Temporal instead.';

const DATE_GLOBAL = 'Date';

const INTL_GLOBAL = 'Intl';

const ALLOWED_INTL_MEMBERS = new Set([
	'ListFormat',
	'DisplayNames',
	'NumberFormat',
	'PluralRules',
	'Segmenter',
	'Collator',
	'Locale',
	'supportedValuesOf',
	'getCanonicalLocales'
]);

const isBanned = (state, node) => {
	switch (node.type) {
		case 'Identifier':
			return state.dateIdentifiers.has(node.name);

		case 'CallExpression':
		case 'NewExpression':
			return isBanned(state, node.callee);

		case 'MemberExpression':
			if (node.computed || node.property.type !== 'Identifier') {
				return false;
			}

			if (node.object.type === 'Identifier' && node.object.name === INTL_GLOBAL) {
				return !ALLOWED_INTL_MEMBERS.has(node.property.name);
			}

			return isBanned(state, node.object);

		default:
			return false;
	}
};

const isReportableMemberExpression = (node) =>
	!node.computed && node.property.type === 'Identifier' && node.parent?.type !== 'CallExpression';

const trackAlias = (state, id, init) => {
	if (
		id.type === 'Identifier' &&
		init?.type === 'NewExpression' &&
		init.callee.type === 'Identifier' &&
		state.dateIdentifiers.has(init.callee.name)
	) {
		state.dateIdentifiers.add(id.name);
	}
};

const reportIfBanned = (state, context, node) => {
	if (!isBanned(state, node)) {
		return;
	}

	const line = node.loc?.start?.line;

	if (line === undefined || state.reportedLines.has(line)) {
		return;
	}

	state.reportedLines.add(line);

	context.report({ message: MESSAGE, node });
};

const rule = {
	create(context) {
		const state = {
			dateIdentifiers: new Set([DATE_GLOBAL]),
			reportedLines: new Set()
		};

		return {
			AssignmentExpression(node) {
				trackAlias(state, node.left, node.right);
			},
			CallExpression(node) {
				reportIfBanned(state, context, node);
			},
			MemberExpression(node) {
				if (!isReportableMemberExpression(node)) {
					return;
				}

				reportIfBanned(state, context, node);
			},
			NewExpression(node) {
				reportIfBanned(state, context, node);
			},
			VariableDeclarator(node) {
				trackAlias(state, node.id, node.init);
			}
		};
	}
};

export default {
	meta: {
		name: 'custom-no-js-date-time'
	},
	rules: {
		'no-js-date-time': rule
	}
};
