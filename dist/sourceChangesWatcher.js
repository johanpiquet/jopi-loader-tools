import path from "node:path";
import { spawn, ChildProcess } from "node:child_process";
import chokidar from "chokidar";
import "jopi-node-space";
/**
 * Watches source directories for changes and restarts a server process automatically.
 * - Add directories to watch (recursively).
 * - Configurable delay (debounce) before restarting.
 * - Includes a helper to auto-detect the source directory when using TypeScript.
 */
export class SourceChangesWatcher {
    _fileWatchingDelay = 500;
    restarting = false;
    _isStarted = false;
    _enableLogs = false;
    _restartDelay = 1500;
    watchDirs;
    env;
    _cmd;
    _args;
    _timerId = 0;
    _isDev;
    constructor(params) {
        this.watchDirs = params.watchDirs;
        if (params.env)
            this.env = params.env;
        else
            this.env = process.env;
        this._cmd = params.cmd || process.argv0;
        this._args = params.args || [];
        this._isDev = params.isDev;
    }
    async start() {
        if (this._isStarted)
            return;
        this._isStarted = true;
        for (const dir of this.watchDirs) {
            await this.watchDirectoryRecursive(dir);
        }
        // Create the first child.
        await this.spawnChild(true);
    }
    async askToRestart(filePath) {
        // Avoid it if inside a hidden directory (start by .).
        let pathParts = filePath.split(path.sep);
        let hiddenPart = pathParts.find(e => e[0] === '.');
        if (hiddenPart)
            return;
        // Avoid it if inside a node module. Reason: some tools used it as a temp.
        let nodeModule = pathParts.find(e => e === 'node_modules');
        if (nodeModule)
            return;
        // Allow avoiding restart until stability is found.
        if (this._timerId) {
            return;
        }
        // @ts-ignore
        this._timerId = setTimeout(async () => {
            this._timerId = 0;
            if (this.restarting)
                return;
            this.restarting = true;
            console.clear();
            if (this._enableLogs) {
                console.log("File change watcher - RESTART for:", filePath);
            }
            try {
                await this.spawnChild();
            }
            finally {
                this.restarting = false;
            }
        }, this._restartDelay);
    }
    async watchDirectoryRecursive(dir) {
        const watcher = chokidar.watch(dir, {
            persistent: true,
            ignoreInitial: true,
            // Ignore common heavy/irrelevant directories
            ignored: (watchedPath) => {
                const b = path.basename(watchedPath);
                return b === 'node_modules' || b === '.git' || b === '.idea' || b === '.vscode';
            },
            awaitWriteFinish: {
                stabilityThreshold: this._fileWatchingDelay,
                pollInterval: Math.min(100, this._fileWatchingDelay)
            }
        });
        watcher.on('all', async (_event, paths) => {
            await this.askToRestart(paths);
        });
        watcher.on('error', () => {
        });
    }
    killAll() {
        if (this._isDev) {
            // > Do a fast hard kill.
            if (gChild && !gChild.killed)
                gChild.kill('SIGKILL');
            process.exit(0);
        }
        else {
            // > Do a soft kill.
            if (gChild) {
                const child = gChild;
                child.kill('SIGTERM');
                setTimeout(() => {
                    if (!child.killed) {
                        child.kill('SIGKILL');
                    }
                }, 3000);
            }
        }
    }
    async spawnChild(ignoreSpawnEvent = false) {
        if (gChild) {
            if (!gChild.killed) {
                // Do a hard kill.
                // Not a problem since we are in dev mode.
                gChild.kill("SIGKILL");
            }
            gChild = undefined;
            await NodeSpace.timer.tick(100);
        }
        let useShell = this._cmd.endsWith('.cmd') || this._cmd.endsWith('.bat') || this._cmd.endsWith('.sh');
        process.on('SIGTERM', () => this.killAll());
        process.on('SIGINT', () => this.killAll());
        process.on('SIGHUP', () => this.killAll());
        process.on('exit', () => this.killAll());
        const child = spawn(this._cmd, this._args, {
            stdio: "inherit", shell: useShell,
            cwd: process.cwd(),
            env: this.env
        });
        gChild = child;
        child.on('exit', (code, signal) => {
            // The current instance has stopped?
            if (gChild === child) {
                if (signal)
                    process.kill(process.pid, signal);
                else
                    process.exit(code ?? 0);
            }
        });
        child.on('error', (err) => {
            // The current instance is in error?
            if (gChild === child) {
                console.error(err.message || String(err));
                process.exit(1);
            }
        });
        if (!ignoreSpawnEvent) {
            child.on("spawn", () => {
                this.onSpawned();
            });
        }
    }
    onSpawned() {
        // To override.
    }
}
let gChild;
//# sourceMappingURL=sourceChangesWatcher.js.map