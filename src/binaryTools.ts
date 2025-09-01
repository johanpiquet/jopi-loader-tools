import fs from "node:fs";
import { WebSocketServer, WebSocket } from 'ws';
import { findExecutable, findPackageJson } from "./tools.js";
import {type ChildProcess, spawn} from "node:child_process";

const nFS = NodeSpace.fs;

const FORCE_LOG = false;
const FORCE_LOG_BUN = false;

let mustLog = false;

interface WatchInfos {
    needWatch: boolean;
    needHot?: boolean;
}

export async function jopiLauncherTool(jsEngine: string) {
    function onSpawned() {
        // If gMustWaitServerReady is set, this means the server
        // will send us a signal once ready. Without that we refresh
        // once the server is created.

        if (!gMustWaitServerReady) {
            setTimeout(wsAskRefreshBrowser, 100);
        }
    }

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
        let res: WatchInfos = {needWatch: isDevMode, needHot: isDevMode && (jsEngine==="bun")};

        let pckJson = findPackageJson();

        if (pckJson) {
            if (mustLog) console.log("Jopi - package.json file found at", pckJson);

            try {
                let json = JSON.parse(await nFS.readTextFromFile(pckJson));
                let jopi: any = json["jopi"];

                if (jopi) {
                    if (jopi.watch===true) {
                        // Force true, even for prod.
                        res.needWatch = true;
                    } else if (jopi.watch===false) {
                        res.needWatch = false;
                    }

                    if (jopi.hot===true) {
                        res.needHot = true;
                    }
                }
            }
            catch (e) {
                console.error(e);
            }
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
                    res.needWatch = true;
                    break;
                case "hot":
                    res.needWatch = true;
                    res.needHot = true;
                    break;
            }
        }

        return res;
    }

    const VERSION = "v1.1.1"
    const importFlag = jsEngine === "node" ? "--import" : "--preload";
    let isDevMode = process.env.NODE_ENV !== 'production';

    mustLog = process.env.JOPI_LOG==="1" || FORCE_LOG || (FORCE_LOG_BUN && (jsEngine==="bun"));
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

    let watchInfos = await getWatchInfos();

    args = args.filter(arg => {
        if (arg === "--hot") {
            watchInfos.needHot = true;
            watchInfos.needWatch = true;
            return false;
        }

        if (arg === "--watch") {
            watchInfos.needHot = false;
            watchInfos.needWatch = true;
            return false;
        }

        return arg !== "--watch-path";
    });

    let mustWatch = watchInfos.needWatch;

    const cwd = process.cwd();
    let env: Record<string, string> = {...process.env} as Record<string, string>;

    if (mustWatch) {
        env["JOPIN_SOURCE_WATCHING_ENABLED"] = "1";

        let wsUrl = await startWebSocket();

        if (wsUrl) {
            env["JOPIN_BROWSER_REFRESH_ENABLED"] = "1";
            env["JOPIN_WEBSOCKET_URL"] = wsUrl;
        }

        let toPrepend: string[] = [];

        if (watchInfos.needHot) toPrepend.push("--hot");
        else toPrepend.push("--watch");

        args = [...toPrepend, ...args];
        NodeSpace.term.logBgBlue("Source watching enabled");
    }

    if (mustLog) console.log("Jopi - Use current working dir:", cwd);
    if (mustLog) console.log("Jopi - Executing:", cmd, ...args);

    spawnChild({
        cmd, env, args, isDev: isDevMode,
        onSpawned
    });
}

export interface SpawnParams {
    env?: Record<string, string>;
    cmd: string;
    args: string[];
    isDev: boolean;
    onSpawned?: (child: ChildProcess) => void;
}

function spawnChild(params: SpawnParams): void {
    function killAll(signalName: NodeJS.Signals) {
        if (child.killed) return;

        if (params.isDev) {
            // > Do a fast hard kill.
            child.kill('SIGKILL');
            process.exit(0);
        } else {
            child.kill(signalName);

            setTimeout(() => {
                if (!child.killed) {
                    child.kill('SIGKILL');
                }
            }, 1000);
        }
    }

    let useShell = params.cmd.endsWith('.cmd') || params.cmd.endsWith('.bat') || params.cmd.endsWith('.sh');

    process.on('SIGTERM', () => killAll("SIGTERM"));
    process.on('SIGINT', () => killAll("SIGINT"));
    process.on('SIGHUP', () => killAll("SIGHUP"));
    process.on('exit', () => killAll("exit" as NodeJS.Signals));

    const child = spawn(params.cmd, params.args, {
        stdio: "inherit", shell: useShell,
        cwd: process.cwd(),
        env: params.env
    });

    child.on('exit', (code, signal) => {
        // The current instance has stopped?
        if (signal) process.kill(process.pid, signal);
        else process.exit(code ?? 0);
    });

    child.on('error', (err) => {
        // The current instance is in error?
        console.error(err.message || String(err));
        process.exit(1);
    });

    if (params.onSpawned) {
        child.on('spawn', () => {
            params.onSpawned!(child);
        })
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
    if (mustLog) NodeSpace.term.logBgGreen("Client connected to web-socket")
    gWebSockets.push(ws);

    ws.onclose = (e) => {
        let idx = gWebSockets.indexOf(e.target);
        gWebSockets.splice(idx, 1);

        if (mustLog) NodeSpace.term.logBgRed("Child process is restarting");
        startWebSocket().catch();
    }

    ws.onmessage = (e) => {
        const msg = e.data;
        if (mustLog) NodeSpace.term.logBlue("jopin websocket message received: ", msg);

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