export const DATA_IN_ROOT = 'data-in';
export const DATA_OUT_ROOT = 'data-out';
export const DATA_OUT_TEMP_ROOT = 'data-out-temp';
export const SIERRA_SOURCE_ROOT = 'src-sierra-cpp';
export const SIERRA_BRIDGE_FILE_NAME = 'tradester_sync_bridge.cpp';
export const SIERRA_BRIDGE_DLL_FILE_NAME = 'tradester_sync_bridge_ARM64.dll';
export const SIERRA_CHARTBOOK_FILE_NAME = '!tradester.Cht';
export const SIERRA_INSTALL_DIR = 'C:\\Trading Software\\DEV-Sierra-Chart\\Sierra Chart';
export const SIERRA_EXE_PATH = `${SIERRA_INSTALL_DIR}\\SierraChart_ARM64.exe`;
export const SIERRA_DATA_DIR = `${SIERRA_INSTALL_DIR}\\Data`;
export const SIERRA_ACS_SOURCE_DIR = `${SIERRA_INSTALL_DIR}\\ACS_Source`;
export const SIERRA_PROCESS_NAME = 'SierraChart_ARM64';
export const SIERRA_LEGACY_PROCESS_NAME = 'SierraChart_64';
export const SIERRA_OPEN_TASK_NAME = 'TradesterOpenSierraInteractive';
export const SIERRA_OPEN_LAUNCHER_FILE_NAME = 'tradester-open-sierra.cmd';
export const SIERRA_WAIT_TIMEOUT_MS = 60_000;
export const SIERRA_WAIT_POLL_MS = 1_000;
export const VISUAL_STUDIO_BUILD_DIR =
	'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Auxiliary\\Build';
export const WINDOWS_POWERSHELL_EXE =
	'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
export const SIERRA_EXPORT_HEADER = [
	'Date',
	'Time',
	'Open',
	'High',
	'Low',
	'Last',
	'Volume',
	'# of Trades',
	'OHLC Avg',
	'HLC Avg',
	'HL Avg',
	'Bid Volume',
	'Ask Volume'
].join(', ');
export const TIMEFRAMES = [
	{ key: 'daily', suffix: '1d' },
	{ key: 'minutes5', suffix: '5m' },
	{ key: 'seconds15', suffix: '15s' },
	{ key: 'volume500', suffix: '500v' },
	{ key: 'priceLevel', suffix: '1s_pl0.25' }
] as const;

export const VALIDATED_TIMEFRAMES = TIMEFRAMES.filter((timeframe) => timeframe.suffix !== '500v');
