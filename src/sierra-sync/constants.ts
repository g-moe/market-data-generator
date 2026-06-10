export const DEFAULT_DATA_OUT_ROOT = 'data-out';
export const DEFAULT_DATA_OUT_TEMP_ROOT = 'data-out-temp';
export const DEFAULT_SIERRA_INSTALL_DIR =
	'C:\\Trading Software\\DEV-Sierra-Chart\\Sierra Chart';
export const SIERRA_BRIDGE_SOURCE_DIR = 'src-sierra-cpp';
export const SIERRA_BRIDGE_FILE_NAME = 'tradester_sync_bridge.cpp';
export const SIERRA_BRIDGE_SOURCE_PATH = `${SIERRA_BRIDGE_SOURCE_DIR}/${SIERRA_BRIDGE_FILE_NAME}`;
export const SIERRA_BRIDGE_DLL_BASE_NAME = 'tradester_sync_bridge';
export const SIERRA_LATEST_RUN_NAME = 'latest';
export const SIERRA_TIME_ZONE = 'America/Chicago';
export const SIERRA_GRAPH_DATA_COLUMNS = [
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
] as const;
export const SIERRA_GRAPH_DATA_HEADER = SIERRA_GRAPH_DATA_COLUMNS.join(', ');
export const SIERRA_EXPORT_TIMEOUT_MS = 60_000;
export const SIERRA_EXPORT_POLL_INTERVAL_MS = 1_000;
export const VISUAL_STUDIO_BUILD_DIR =
	'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Auxiliary\\Build';
export const WINDOWS_POWERSHELL_EXE =
	'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
