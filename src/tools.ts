import fs from "node:fs/promises";
import path from "node:path";
import "jopi-node-space";

export async function getFileStat(filePath: string) {
    try { return await fs.stat(filePath); }
    catch { return undefined; }
}

export async function isFile(filePath: string): Promise<boolean> {
    const stats = await getFileStat(filePath);
    if (!stats) return false;
    return stats.isFile();
}

/**
 * Search the source of the component if it's a JavaScript and not a TypeScript.
 * Why? Because EsBuild doesn't work well on already transpiled code.
 */
export async function searchSourceOf(scriptPath: string) {
    async function tryResolve(filePath: string, outDir: string) {
        let out = path.sep + outDir + path.sep;
        let idx = filePath.lastIndexOf(out);

        if (idx !== -1) {
            filePath = filePath.slice(0, idx) + path.sep + "src" + path.sep + filePath.slice(idx + out.length);
            if (await isFile(filePath)) return filePath;
        }

        return undefined;
    }

    let scriptExt = path.extname(scriptPath);

    if ((scriptExt===".ts") || (scriptExt===".tsx")) {
        // Is already the source.
        return scriptPath;
    }

    const originalScriptPath = scriptPath;
    let isJavascript = (scriptPath.endsWith(".js")||(scriptPath.endsWith(".jsx")));

    if (isJavascript) {
        // Remove his extension.
        scriptPath = scriptPath.slice(0, -scriptExt.length);
    }

    let tryDirs = ["dist", "build"];

    for (let toTry of tryDirs) {
        if (isJavascript) {
            let found = await tryResolve(scriptPath + ".tsx", toTry);
            if (found) return found;

            found = await tryResolve(scriptPath + ".ts", toTry);
            if (found) return found;
        } else {
            let found = await tryResolve(scriptPath, toTry);
            if (found) return found;
        }
    }

    return originalScriptPath;
}

