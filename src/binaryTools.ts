import path from "node:path";
import fs from "node:fs";
import {SourceChangesWatcher} from "./sourceChangesWatcher.ts";
import { WebSocketServer, WebSocket } from 'ws';
import {findExecutable, findPackageJson,} from "./tools.js";

const nFS = NodeSpace.fs;

const FORCE_LOG = true;
const FORCE_LOG_BUN = false;

enum WATCH_MODE { NONE, SOURCES }

interface WatchInfos {
    mode: WATCH_MODE;
    dirToWatch: string[];
}

export async function jopiLauncherTool(jsEngine: string) {
    function addKnownPackages(toPreload: string[], toSearch: string[]) {
        if (!toSearch) return;

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

            let toPreload: string[] = [];

            if (packageData.preload) {
                if (Array.isArray(packageData.preload)) {
                    toPreload = [...toPreload, ...packageData.preload];
                }
            }

            addKnownPackages(toPreload, packageData["devDependencies"]);
            addKnownPackages(toPreload, packageData["dependencies"]);

            return toPreload;

        } catch {
            // Ignore parsing errors and continue without preload modules.
            return [];
        }
    }

    async function getWatchInfos(): Promise<WatchInfos> {
        let res: WatchInfos = {mode: isDevMode ? WATCH_MODE.SOURCES : WATCH_MODE.NONE, dirToWatch: []};
        let pckJson = findPackageJson();

        if (pckJson) {
            if (mustLog) console.log("Jopi - package.json file found at", pckJson);

            try {
                let json = JSON.parse(await nFS.readTextFromFile(pckJson));
                let watchDirEntry: any = json.watchDirs;
                if (!watchDirEntry) watchDirEntry = json["watch-dirs"];
                if (!watchDirEntry) watchDirEntry = json["watch"];

                if (watchDirEntry) {
                    if (watchDirEntry===true) {
                        res.mode = WATCH_MODE.SOURCES;
                    } else if (watchDirEntry===false) {
                        res.mode = WATCH_MODE.NONE;
                    } else if (watchDirEntry instanceof Array) {
                        for (let value of watchDirEntry) {
                            if (typeof(value) === "string") {
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
                if (mustLog) console.log("Jopi - source dir found at", srcDir);
            } else {
                srcDir = path.dirname(pckJson);
                if (mustLog) console.log("Jopi - use this dir for sources", srcDir);
            }

            res.dirToWatch.push(srcDir);
        } else if (isDevMode) {
            console.warn("Jopi - package.json not found, can't enable file watching");
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

    const VERSION = "v1.1.1"
    const mustLog = process.env.JOPI_LOG || FORCE_LOG || (FORCE_LOG_BUN && (jsEngine==="bun"));
    const importFlag = jsEngine === "node" ? "--import" : "--preload";
    let isDevMode = process.env.NODE_ENV !== 'production';

    if (mustLog) console.log("Jopi version:", VERSION);

    const knowPackagesToPreload = ["jopi-rewrite"];

    // Here first is node.js, second is jopi. (it's du to shebang usage).
    const argv = process.argv.slice(2);

    let toPreload = getPreloadModules();
    toPreload = ["jopi-loader", ...toPreload];

    let preloadArgs: string[] = [];

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

    let cmd = findExecutable(jsEngine, jsEngine)!;
    if (mustLog) console.log("Jopi - Using " + jsEngine + " from:", cmd);
    let args = [...preloadArgs, ...argv];

    const cwd = process.cwd();

    if (mustLog) console.log("Jopi - Use current working dir:", cwd);
    if (mustLog) console.log("Jopi - Executing:", cmd, ...args);

    let env: Record<string, string> = {...process.env} as Record<string, string>;

    let watchInfos = await getWatchInfos();
    let mustWatch = watchInfos.mode !== WATCH_MODE.NONE;

    if (mustWatch && jsEngine==="bun") {
        if (process.argv.includes("--hot")) {
            mustWatch = false;
            if (mustLog) console.log("Jopi - Hot reload option is set for bun.js (--hot). Will not watch sources");
        } else  if (process.argv.includes("--watch")) {
            mustWatch = false;
            if (mustLog) console.log("Jopi - Watch option is set for bun.js (--watch). Will not watch sources");
        }
    }

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
    }

    if (mustWatch) {
        if (mustLog) {
            console.log("Jopi - Will watch directories:", watchInfos.dirToWatch);
        }

        NodeSpace.term.logBgBlue("Source watching enabled");
        watcher.start().catch(console.error);
    } else {
        watcher.spawnChild(true).catch(console.error);
    }
}

function tryOpenWS(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
        const wss = new WebSocketServer({port});

        wss.on('connection', ws => {
            onWebSocketConnection(ws);
        });

        wss.on("listening", ()=>{
            resolve()
        });

        wss.on('error', (e)=>{
            reject(e);
        });
    });
}

async function startWebSocket(): Promise<string|undefined> {
    for (let port=5100;port<5400;port++) {
        try {
            await tryOpenWS(port);
            //console.log("Port accepted: " + port);
            return "ws://127.0.0.1:" + port
        }
        catch(_e) {
            console.log("Port", port, "is ko");
        }
    }

    return undefined;
}

function onWebSocketConnection(ws: WebSocket) {
    //console.log("Client connected to web-socket");
    gWebSockets.push(ws);

    ws.onclose = (e) => {
        let idx = gWebSockets.indexOf(e.target);
        gWebSockets.splice(idx, 1);
    }

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
    })
}

const gWebSockets: WebSocket[] = [];
let gMustWaitServerReady: boolean = false;
