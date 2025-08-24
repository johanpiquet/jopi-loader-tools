import "jopi-node-space";
export interface SourceChangesWatcherParams {
    watchDirs: string[];
    env?: Record<string, string>;
    cmd?: string;
    args?: string[];
    isDev: boolean;
}
/**
 * Watches source directories for changes and restarts a server process automatically.
 * - Add directories to watch (recursively).
 * - Configurable delay (debounce) before restarting.
 * - Includes a helper to auto-detect the source directory when using TypeScript.
 */
export declare class SourceChangesWatcher {
    private readonly _fileWatchingDelay;
    private restarting;
    private _isStarted;
    private _enableLogs;
    private _restartDelay;
    private readonly watchDirs;
    private readonly env;
    private readonly _cmd;
    private readonly _args;
    private _timerId;
    private readonly _isDev;
    constructor(params: SourceChangesWatcherParams);
    start(): Promise<void>;
    private askToRestart;
    private watchDirectoryRecursive;
    private killAll;
    spawnChild(ignoreSpawnEvent?: boolean): Promise<void>;
    onSpawned(): void;
}
