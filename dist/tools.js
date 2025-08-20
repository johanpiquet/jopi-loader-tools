import fs from "node:fs/promises";
import path from "node:path";
export async function getFileStat(filePath) {
    try {
        return await fs.stat(filePath);
    }
    catch {
        return undefined;
    }
}
export async function isFile(filePath) {
    const stats = await getFileStat(filePath);
    if (!stats)
        return false;
    return stats.isFile();
}
/**
 * Search the source of the component if it's a JavaScript and not a TypeScript.
 * Why? Because EsBuild doesn't work well on already transpiled code.
 */
export async function searchSourceOf(scriptPath) {
    async function tryResolve(filePath, outDir) {
        let out = path.sep + outDir + path.sep;
        let idx = filePath.lastIndexOf(out);
        if (idx !== -1) {
            filePath = filePath.slice(0, idx) + path.sep + "src" + path.sep + filePath.slice(idx + out.length);
            if (await isFile(filePath))
                return filePath;
            filePath += "x";
            if (await isFile(filePath))
                return filePath;
        }
        return undefined;
    }
    let found = await tryResolve(scriptPath, "dist");
    if (found)
        return found;
    found = await tryResolve(scriptPath, "build");
    if (found)
        return found;
    return scriptPath;
}
//# sourceMappingURL=tools.js.map