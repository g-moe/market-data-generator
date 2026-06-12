import type { Symbol } from '../contracts/index.ts';
import { findSymbol, getSymbolConfig } from '../contracts/symbols.ts';
import { createBridgeSource } from './bridge-source.ts';
import { getTimeframes } from '../contracts/index.ts';
import { assertInputDataExists } from './input-data.ts';
import { sierraExportFileName, sierraSyncPaths } from './paths.ts';
import { mergeValidatedSierraExports } from './sierra-export.ts';
import { createNodeSierraOps, type SierraOps } from './sierra-ops.ts';

export type SierraSyncResult = {
	bridgeInstalledPath: string;
	chartbookInstalledPath: string;
	inputDir: string;
	outputDir: string;
	scidInstalledPath: string;
	tempDir: string;
};

export type SierraSyncOptions = {
	log?: (message: string) => void;
	ops?: SierraOps;
};

export function assertSierraSyncSupportedPlatform() {
	const { platform } = process;

	if (platform !== 'win32') {
		throw new Error(`sierra-sync can only run on Windows. Current platform: ${platform}`);
	}
}

export async function runSierraSync(
	rawSymbol: string,
	options: SierraSyncOptions = {}
): Promise<SierraSyncResult> {
	assertSierraSyncSupportedPlatform();

	const { log = console.log } = options;
	const ops = options.ops ?? createNodeSierraOps();
	const symbol = requireSymbol(rawSymbol);
	const config = getSymbolConfig(symbol);
	const paths = sierraSyncPaths(symbol);
	const exportFiles = getTimeframes(symbol).map((timeframe) =>
		sierraExportFileName(symbol, timeframe)
	);

	log(`Checking data-in/${config.symbolId}`);
	await assertInputDataExists(symbol, paths.files);

	log(`Clearing ${paths.tempDir}`);
	await ops.cleanTempDir(paths.tempDir);

	log(`Clearing ${paths.outputDir}`);
	await ops.cleanTempDir(paths.outputDir);

	log('Closing Sierra Chart if it is running');
	await ops.closeSierra();

	log('Writing Sierra bridge source');
	const bridgeSource = await createBridgeSource({
		files: paths.files,
		symbol,
		tempDir: paths.tempDir
	});
	const bridgeInstalledPath = await ops.installBridgeSource(bridgeSource);

	log('Building Sierra bridge');
	await ops.buildBridge();

	log('Installing SCID and chartbook');
	log(`Copying generated tick SCID into Data directory as ${paths.chartbookScidFileName}`);
	const scidInstalledPath = await ops.copyScid(paths.files.scid, paths.chartbookScidFileName);

	log(`SCID copy verified at ${scidInstalledPath}`);
	log('Copying chartbook into Sierra Data directory');
	const chartbookInstalledPath = await ops.copyChartbook(paths.chartbookSourcePath);

	log(
		'Sierra startup setting required: General Settings >> Startup >> Open Files on Startup >> YES'
	);
	log(
		'Sierra startup setting required: General Settings >> Startup >> Files to open at startup >> !tradester.Cht'
	);
	log('Opening Sierra Chart');
	await ops.openSierra();

	log('Waiting for Sierra exports');

	await ops.waitForFiles(paths.tempDir, exportFiles);

	log('Validating Sierra OHLCV and writing data-out');
	await mergeValidatedSierraExports({
		inputFiles: paths.files,
		outputDir: paths.outputDir,
		symbol,
		tempDir: paths.tempDir
	});

	log(`Wrote merged Sierra data to ${paths.outputDir}`);

	return {
		bridgeInstalledPath,
		chartbookInstalledPath,
		inputDir: paths.inputDir,
		outputDir: paths.outputDir,
		scidInstalledPath,
		tempDir: paths.tempDir
	};
}

function requireSymbol(rawSymbol: string): Symbol {
	const symbol = findSymbol(rawSymbol);
	if (symbol === undefined) throw new Error(`Unknown symbol: ${rawSymbol}`);

	return symbol;
}
