import path from "node:path";
import fs from "node:fs";
import { SourceChangesWatcher } from "./sourceChangesWatcher.js";
import { WebSocketServer, WebSocket } from 'ws';
import { convertWin32ToLinuxPath, findExecutable, findModuleDir, findModuleEntryPoint, findPackageJson, getRelativePath } from "./tools.js";
const nFS = NodeSpace.fs;
const FORCE_LOG = false;
const FORCE_LOG_BUN = false;
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
        /*const pkgPath = findModuleDir(pkg);
        if (!pkgPath) return;

        let foundPath = getRelativePath(findModuleEntryPoint(pkgPath));
        if (isWin32) foundPath = convertWin32ToLinuxPath(foundPath);

        if (foundPath) {
            preloadArgs.push(importFlag);
            preloadArgs.push(foundPath);
        }*/
        preloadArgs.push(importFlag);
        preloadArgs.push(pkg);
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
        cmd, env, args, isDev: isDevMode,
        watchDirs: watchInfos.dirToWatch,
    });
    watcher.onSpawned = () => {
        // If gMustWaitServerReady is set, this means the server
        // will send us a signal once ready. Without that we refresh
        // once the server is created.
        if (!gMustWaitServerReady) {
            setTimeout(wsAskRefreshBrowser, 100);
        }
    };
    if (mustWatch) {
        NodeSpace.term.logBgBlue("Source watching enabled");
        watcher.start().catch(console.error);
    }
    else {
        watcher.spawnChild(true).catch(console.error);
    }
}
function tryOpenWS(port) {
    return new Promise((resolve, reject) => {
        const wss = new WebSocketServer({ port });
        wss.on('connection', ws => {
            onWebSocketConnection(ws);
        });
        wss.on("listening", () => {
            resolve();
        });
        wss.on('error', (e) => {
            reject(e);
        });
    });
}
async function startWebSocket() {
    for (let port = 5100; port < 5400; port++) {
        try {
            await tryOpenWS(port);
            //console.log("Port accepted: " + port);
            return "ws://127.0.0.1:" + port;
        }
        catch (_e) {
            console.log("Port", port, "is ko");
        }
    }
    return undefined;
}
function onWebSocketConnection(ws) {
    //console.log("Client connected to web-socket");
    gWebSockets.push(ws);
    ws.onclose = (e) => {
        let idx = gWebSockets.indexOf(e.target);
        gWebSockets.splice(idx, 1);
    };
    ws.onmessage = (e) => {
        const msg = e.data;
        //console.log("jopin message received: ", msg);
        switch (msg) {
            case "mustWaitServerReady":
                gMustWaitServerReady = true;
                break;
            case "askRefreshingBrowser":
                wsAskRefreshBrowser();
                break;
            case "declareServerReady":
                wsAskRefreshBrowser();
                break;
        }
    };
}
function wsAskRefreshBrowser() {
    gWebSockets.forEach(ws => {
        ws.send("browser-refresh-asked");
    });
}
const gWebSockets = [];
let gMustWaitServerReady = false;
//# sourceMappingURL=binaryTools.js.map