import path from "node:path";
import fs from "node:fs";
import SourceChangesWatcher from "./sourceChangesWatcher.js";
import { WebSocketServer } from 'ws';
const nFS = NodeSpace.fs;
const FORCE_LOG = true;
const FORCE_LOG_BUN = true;
var WATCH_MODE;
(function (WATCH_MODE) {
    WATCH_MODE[WATCH_MODE["NONE"] = 0] = "NONE";
    WATCH_MODE[WATCH_MODE["SOURCES"] = 1] = "SOURCES";
})(WATCH_MODE || (WATCH_MODE = {}));
export async function jopiLauncherTool(jsEngine) {
    function addKnownPackages(toPreload, toSearch) {
        if (!toSearch)
            return;
        for (const key in toSearch) {
            if (knowPackagesToPreload.includes(key)) {
                toPreload.push(key);
            }
        }
    }
    function getPreloadModules() {
        const packageJsonPath = findPackageJson();
        if (!packageJsonPath) {
            return [];
        }
        try {
            const packageContent = fs.readFileSync(packageJsonPath, 'utf8');
            const packageData = JSON.parse(packageContent);
            let toPreload = [];
            if (packageData.preload) {
                if (Array.isArray(packageData.preload)) {
                    toPreload = [...toPreload, ...packageData.preload];
                }
            }
            addKnownPackages(toPreload, packageData["devDependencies"]);
            addKnownPackages(toPreload, packageData["dependencies"]);
            return toPreload;
        }
        catch {
            // Ignore parsing errors and continue without preload modules.
            return [];
        }
    }
    async function getWatchInfos() {
        let res = { mode: isDevMode ? WATCH_MODE.SOURCES : WATCH_MODE.NONE, dirToWatch: [] };
        let pckJson = findPackageJson();
        if (pckJson) {
            try {
                let json = JSON.parse(await nFS.readTextFromFile(pckJson));
                let watchDirEntry = json.watchDirs;
                if (!watchDirEntry)
                    watchDirEntry = json["watch-dirs"];
                if (!watchDirEntry)
                    watchDirEntry = json["watch"];
                if (watchDirEntry) {
                    if (watchDirEntry === true) {
                        res.mode = WATCH_MODE.SOURCES;
                    }
                    else if (watchDirEntry === false) {
                        res.mode = WATCH_MODE.NONE;
                    }
                    else if (watchDirEntry instanceof Array) {
                        for (let value of watchDirEntry) {
                            if (typeof (value) === "string") {
                                res.dirToWatch.push(path.resolve(value));
                            }
                        }
                    }
                }
            }
            catch (e) {
                console.error(e);
            }
            let srcDir = path.join(path.dirname(pckJson), "src");
            if (await nFS.isDirectory(srcDir)) {
                res.dirToWatch.push(srcDir);
            }
        }
        let watch = process.env.WATCH;
        if (watch) {
            switch (watch) {
                case "0":
                case "false":
                case "no":
                    break;
                case "1":
                case "true":
                case "yes":
                    res.mode = WATCH_MODE.SOURCES;
                    break;
            }
        }
        return res;
    }
    const VERSION = "v1.1.1";
    const mustLog = process.env.JOPI_LOG || FORCE_LOG || (FORCE_LOG_BUN && (jsEngine === "bun"));
    const importFlag = jsEngine === "node" ? "--import" : "--preload";
    const isWin32 = path.sep === '\\';
    let isDevMode = process.env.NODE_ENV !== 'production';
    if (mustLog)
        console.log("Jopi version:", VERSION);
    const knowPackagesToPreload = ["jopi-rewrite"];
    // Here first is node.js, second is jopi. (it's du to shebang usage).
    const argv = process.argv.slice(2);
    let toPreload = getPreloadModules();
    toPreload = ["jopi-loader", ...toPreload];
    let preloadArgs = [];
    // We need the absolute path.
    toPreload.forEach(pkg => {
        const pkgPath = findModuleDir(pkg);
        if (!pkgPath)
            return;
        let foundPath = getRelativePath(findModuleEntryPoint(pkgPath));
        if (isWin32)
            foundPath = convertWin32ToLinuxPath(foundPath);
        if (foundPath) {
            preloadArgs.push(importFlag);
            preloadArgs.push(foundPath);
        }
    });
    let cmd = findExecutable(jsEngine, jsEngine);
    if (mustLog)
        console.log("Jopi - Using " + jsEngine + " from:", cmd);
    let args = [...preloadArgs, ...argv];
    const cwd = process.cwd();
    if (mustLog)
        console.log("Use current working dir:", cwd);
    if (mustLog)
        console.log("Jopi - Executing:", cmd, ...args);
    let env = { ...process.env };
    let watchInfos = await getWatchInfos();
    let mustWatch = watchInfos.mode !== WATCH_MODE.NONE;
    if (mustWatch) {
        env["JOPIN_SOURCE_WATCHING_ENABLED"] = "1";
        let wsUrl = await startWebSocket();
        if (wsUrl) {
            env["JOPIN_BROWSER_REFRESH_ENABLED"] = "1";
            env["JOPIN_WEBSOCKET_URL"] = wsUrl;
        }
    }
    const watcher = new SourceChangesWatcher({
        cmd, env, args,
        watchDirs: watchInfos.dirToWatch,
    });
    if (mustWatch) {
        NodeSpace.term.logBgBlue("Source watching enabled");
        watcher.start().catch(console.error);
    }
    else {
        watcher.spawnChild().catch(console.error);
    }
}
/**
 * Transform an absolute path to a relative path.
 */
function getRelativePath(absolutePath, fromPath = process.cwd()) {
    return path.relative(fromPath, absolutePath);
}
/**
 * Convert a simple win32 path to a linux path.
 */
function convertWin32ToLinuxPath(filePath) {
    return filePath.replace(/\\/g, '/');
}
/**
 * Find the full path of an executable (like the which/where command).
 * Automatically add ".exe" / ".cmd" / ".bat" for windows.
 *
 * @param cmd - The name of the executable to search.
 * @param ifNotFound - What to return if not found.
 * @returns - The full path of the executable, or the name of the command if not found.
 */
function findExecutable(cmd, ifNotFound) {
    const paths = (process.env.PATH || '').split(path.delimiter);
    if (process.platform === 'win32') {
        const extToTest = process.env.PATHEXT ? process.env.PATHEXT.split(';') : ['.EXE', '.CMD', '.BAT'];
        for (const p of paths) {
            for (const ext of extToTest) {
                const full = path.join(p, cmd + ext.toLowerCase());
                if (fs.existsSync(full))
                    return full;
                const fullUpper = path.join(p, cmd + ext);
                if (fs.existsSync(fullUpper))
                    return fullUpper;
            }
        }
    }
    else {
        for (const p of paths) {
            const full = path.join(p, cmd);
            if (fs.existsSync(full))
                return full;
            const fullUpper = path.join(p, cmd);
            if (fs.existsSync(fullUpper))
                return fullUpper;
        }
    }
    // Let spawn resolve
    return ifNotFound;
}
/**
 * Search the package.json file for the currently executing script.
 * Use the current working dir and search in parent directories.
 *
 * @return - Returns the full path of the file 'package.json' or null.
 */
function findPackageJson() {
    if (gPackageJsonPath !== undefined)
        return gPackageJsonPath;
    let currentDir = process.cwd();
    while (true) {
        const packagePath = path.join(currentDir, 'package.json');
        if (fs.existsSync(packagePath))
            return gPackageJsonPath = packagePath;
        const parentDir = path.dirname(currentDir);
        // Reached root directory
        if (parentDir === currentDir)
            break;
        currentDir = parentDir;
    }
    return null;
}
/**
 * Search the entry point of the current package (ex: ./dist/index.json)
 * @param nodeModuleDir - The path of the current module.
 * @returns Returns the full path of the script.
 */
function findModuleEntryPoint(nodeModuleDir) {
    const packageJsonPath = path.join(nodeModuleDir, 'package.json');
    // >>> Try to take the "main" information inside the package.json.
    if (fs.existsSync(packageJsonPath)) {
        try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            if (packageJson.main) {
                const mainPath = path.join(nodeModuleDir, packageJson.main);
                if (fs.existsSync(mainPath))
                    return mainPath;
            }
        }
        catch {
            // Ignore JSON parse errors
        }
    }
    // >>> "main" not set? Try all common path.
    const commonPaths = [
        path.join('dist', 'index.js'),
        path.join('lib', 'index.js'),
        path.join('src', 'index.js'),
        'index.js'
    ];
    for (const commonPath of commonPaths) {
        const fullPath = path.join(nodeModuleDir, commonPath);
        if (fs.existsSync(fullPath))
            return fullPath;
    }
    // Default to dist/index.js
    return path.join(nodeModuleDir, 'dist', 'index.js');
}
/**
 * Searches for the directory of a specified module.
 *
 * @param moduleName - The name of the module to find.
 * @return The path to the module directory if found, or null if not found.
 */
function findModuleDir(moduleName) {
    let currentDir = process.cwd();
    while (true) {
        const packagePath = path.join(currentDir, 'node_modules', moduleName);
        if (fs.existsSync(packagePath)) {
            return packagePath;
        }
        const parentDir = path.dirname(currentDir);
        // Reached root directory
        if (parentDir === currentDir) {
            break;
        }
        currentDir = parentDir;
    }
    return null;
}
async function startWebSocket() {
    for (let port = 100; port < 6000; port++) {
        try {
            const wss = new WebSocketServer({ port });
            wss.on('connection', onWebSocketConnection);
            return "ws://127.0.0.1:" + port;
        }
        catch {
        }
    }
    return undefined;
}
function onWebSocketConnection(ws) {
    console.log("Client connected to web-socket");
}
let gPackageJsonPath;
//# sourceMappingURL=binaryTools.js.map