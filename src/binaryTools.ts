import fs from "node:fs";
import {WebSocket, WebSocketServer} from 'ws';
import {type ChildProcess, spawn} from "node:child_process";
import path from "node:path";
import NodeSpace from "jopi-node-space";

// *************************
const FORCE_LOG = false;
const VERSION = "v1.1.45";
// *************************

const nFS = NodeSpace.fs;
let mustLog = false; // Set env var JOPI_LOG to 1 to enable.

interface WatchInfos {
    needWatch: boolean;
    needHot?: boolean;

    hasJopiWatchTask?: boolean;
    hasJopiWatchTask_node?: boolean;
    hasJopiWatchTask_bun?: boolean;

    packageJsonFilePath?: string;
}

function checkIfDevMode() {
    const idx = process.argv.indexOf("--jopi-dev");
    if (idx===-1) return false;

    process.argv.splice(idx, 1);
    return true;
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
        const packageJsonPath = NodeSpace.app.findPackageJson();

        if (!packageJsonPath) {
            return [];
        }

        try {
            const packageContent = fs.readFileSync(packageJsonPath, 'utf8');
            const packageData = JSON.parse(packageContent);

            let toPreload: string[] = [];

            let jopi = packageData.jopi;

            if (jopi && jopi.preload) {
                if (Array.isArray(jopi.preload)) {
                    toPreload = [...toPreload, ...jopi.preload];
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

    async function getConfiguration(): Promise<WatchInfos> {
        let res: WatchInfos = {
            needWatch: gIsDevMode,
            needHot: gIsDevMode && (jsEngine==="bun")
        };

        let pckJson = NodeSpace.app.findPackageJson();

        if (pckJson) {
            if (mustLog) console.log("Jopi - package.json file found at", pckJson);

            res.packageJsonFilePath = pckJson;

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

                if (json.scripts) {
                    let scripts = json.scripts;

                    if (scripts.jopiWatch) res.hasJopiWatchTask = true;
                    if (scripts.jopiWatch_node) res.hasJopiWatchTask_node = true;
                    if (scripts.jopiWatch_bun) res.hasJopiWatchTask_bun = true;
                }
            }
            catch (e) {
                console.error(e);
            }
        } else if (process.env.NODE_ENV !== 'production') {
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

    const importFlag = jsEngine === "node" ? "--import" : "--preload";

    mustLog = process.env.JOPI_LOG==="1" || FORCE_LOG;
    if (mustLog) console.log("Jopi version:", VERSION, " - engine:", jsEngine);
    if (mustLog) console.log("Library @jopi-loader/tools found at", import.meta.dirname);

    const knowPackagesToPreload = ["jopi-rewrite"];

    // Here first is node.js, second is jopi. (it's du to shebang usage).
    const argv = process.argv.slice(2);

    if (!argv.length) {
        console.log("jopi-loader "+ VERSION +" installed at ", import.meta.dirname);
        return;
    }

    let toPreload = getPreloadModules();
    toPreload = ["jopi-loader", ...toPreload];

    let preloadArgs: string[] = [];

    toPreload.forEach(pkg => {
        preloadArgs.push(importFlag);
        preloadArgs.push(pkg);
    });

    preloadArgs.push("--loader", "jopi-loader/loader");
    preloadArgs.push("--no-warnings");

    let cmd = NodeSpace.os.whichSync(jsEngine, jsEngine)!;
    if (mustLog) console.log("Jopi - Using " + jsEngine + " from:", cmd);
    let args = [...preloadArgs, ...argv];

    let config = await getConfiguration();

    args = args.filter(arg => {
        if (arg === "--hot") {
            config.needHot = true;
            config.needWatch = true;
            return false;
        }

        if (arg === "--watch") {
            config.needHot = false;
            config.needWatch = true;
            return false;
        }

        return arg !== "--watch-path";
    });

    let mustWatch = config.needWatch;

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

        if (config.needHot) toPrepend.push("--hot");
        else toPrepend.push("--watch");

        args = [...toPrepend, ...args];
        NodeSpace.term.logBlue("Source watching enabled.");
    }

    if (mustLog) console.log("Jopi - Use current working dir:", cwd);
    if (mustLog) console.log("Jopi - Executing:", cmd, ...args);

    let mainSpawnParams: SpawnParams =  {
        cmd, env, args, onSpawned, cwd: process.cwd(), killOnExit: false
    };

    spawnChild(mainSpawnParams);

    if (gIsDevMode) {
        function execTask(taskName: string) {
            let cwd = path.dirname(config.packageJsonFilePath!);
            cmd = isNodeJs ? "npm" : "bun";
            spawnChild({cmd, env, cwd, args: ["run", taskName], killOnExit: false})
        }

        let isNodeJs = jsEngine == "node";
        if (config.hasJopiWatchTask) execTask("jopiWatch");
        if (isNodeJs && config.hasJopiWatchTask_node) execTask("jopiWatch_node");
        if (!isNodeJs && config.hasJopiWatchTask_bun) execTask("jopiWatch_bun");
    }
}

export interface SpawnParams {
    env?: Record<string, string>;
    cmd: string;
    args: string[];
    cwd: string;
    killOnExit: boolean;
    onSpawned?: (child: ChildProcess) => void;
}

function killAll(signalName: NodeJS.Signals) {
    gToKill.forEach(child => {
        if (child.killed) return;

        if (gIsDevMode) {
            // > Do a fast hard kill.
            child.kill('SIGKILL');
            process.exit(0);
        } else {
            try {
                child.kill(signalName);
            }
            catch {
            }

            setTimeout(() => {
                if (!child.killed) {
                    child.kill('SIGKILL');
                }
            }, 1000);
        }
    });
}

function spawnChild(params: SpawnParams): void {
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

    gToKill.push(child);

    if (params.killOnExit) {
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
    }

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
    // Allow forcing the url, which is needed for docker env.
    if (process.env.JOPIN_WEBSOCKET_PORT) {
        let port = parseInt(process.env.JOPIN_WEBSOCKET_PORT);

        try {
            await tryOpenWS(port);
            return "ws://127.0.0.1:" + port;
        }
        catch {
            throw "Can't use port " + port + " for websocket. See env var JOPIN_WEBSOCKET_PORT."
        }
    }

    for (let port=5100;port<5400;port++) {
        try {
            await tryOpenWS(port);
            return "ws://127.0.0.1:" + port;
        }
        catch {
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

const gIsDevMode = checkIfDevMode();
const gToKill: ChildProcess[] = [];
const gWebSockets: WebSocket[] = [];
let gMustWaitServerReady: boolean = false;