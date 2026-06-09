import { defineConfig } from 'vitest/config';

const ALWAYS_EXCLUDE = ['**/node_modules/**'] as const;

export default defineConfig({
	test: {
		coverage: {
			provider: 'v8' as const,
			thresholds: {
				branches: 90,
				functions: 90,
				lines: 90,
				statements: 90
			}
		},
		projects: [
			{
				test: {
					exclude: ['**/*.e2e.test.ts', ...ALWAYS_EXCLUDE],
					include: ['src/**/*.node.test.ts'],
					name: 'unit'
				}
			},
			{
				test: {
					exclude: [...ALWAYS_EXCLUDE],
					include: ['src/**/*.e2e.test.ts'],
					name: 'e2e',
					testTimeout: 10 * 60 * 1000
				}
			}
		]
	}
});
