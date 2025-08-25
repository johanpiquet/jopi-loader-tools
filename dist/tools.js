import fs from "node:fs/promises";
import path from "node:path";
import "jopi-node-space";
import fss from "node:fs";
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
        }
        return undefined;
    }
    let scriptExt = path.extname(scriptPath);
    if ((scriptExt === ".ts") || (scriptExt === ".tsx")) {
        // Is already the source.
        return scriptPath;
    }
    const originalScriptPath = scriptPath;
    let isJavascript = (scriptPath.endsWith(".js") || (scriptPath.endsWith(".jsx")));
    if (isJavascript) {
        // Remove his extension.
        scriptPath = scriptPath.slice(0, -scriptExt.length);
    }
    let tryDirs = ["dist", "build"];
    for (let toTry of tryDirs) {
        if (isJavascript) {
            let found = await tryResolve(scriptPath + ".tsx", toTry);
            if (found)
                return found;
            found = await tryResolve(scriptPath + ".ts", toTry);
            if (found)
                return found;
        }
        else {
            let found = await tryResolve(scriptPath, toTry);
            if (found)
                return found;
        }
    }
    return originalScriptPath;
}
/**
 * Find the full path of an executable (like the which/where command).
 * Automatically add ".exe" / ".cmd" / ".bat" for windows.
 *
 * @param cmd - The name of the executable to search.
 * @param ifNotFound - What to return if not found.
 * @returns - The full path of the executable, or the name of the command if not found.
 */
export function findExecutable(cmd, ifNotFound) {
    const paths = (process.env.PATH || '').split(path.delimiter);
    if (process.platform === 'win32') {
        const extToTest = process.env.PATHEXT ? process.env.PATHEXT.split(';') : ['.EXE', '.CMD', '.BAT'];
        for (const p of paths) {
            for (const ext of extToTest) {
                const full = path.join(p, cmd + ext.toLowerCase());
                if (fss.existsSync(full))
                    return full;
                const fullUpper = path.join(p, cmd + ext);
                if (fss.existsSync(fullUpper))
                    return fullUpper;
            }
        }
    }
    else {
        for (const p of paths) {
            const full = path.join(p, cmd);
            if (fss.existsSync(full))
                return full;
            const fullUpper = path.join(p, cmd);
            if (fss.existsSync(fullUpper))
                return fullUpper;
        }
    }
    // Let spawn resolve
    return ifNotFound;
}
/**
 * Transform an absolute path to a relative path.
 */
export function getRelativePath(absolutePath, fromPath = process.cwd()) {
    return path.relative(fromPath, absolutePath);
}
/**
 * Convert a simple win32 path to a linux path.
 */
export function convertWin32ToLinuxPath(filePath) {
    return filePath.replace(/\\/g, '/');
}
let gPackageJsonPath;
/**
 * Search the package.json file for the currently executing script.
 * Use the current working dir and search in parent directories.
 *
 * @return - Returns the full path of the file 'package.json' or null.
 */
export function findPackageJson() {
    if (gPackageJsonPath !== undefined)
        return gPackageJsonPath;
    let currentDir = process.cwd();
    while (true) {
        const packagePath = path.join(currentDir, 'package.json');
        if (fss.existsSync(packagePath))
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
export function findModuleEntryPoint(nodeModuleDir) {
    const packageJsonPath = path.join(nodeModuleDir, 'package.json');
    // >>> Try to take the "main" information inside the package.json.
    if (fss.existsSync(packageJsonPath)) {
        try {
            const packageJson = JSON.parse(fss.readFileSync(packageJsonPath, 'utf8'));
            if (packageJson.main) {
                const mainPath = path.join(nodeModuleDir, packageJson.main);
                if (fss.existsSync(mainPath))
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
        if (fss.existsSync(fullPath))
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
export function findModuleDir(moduleName) {
    let currentDir = process.cwd();
    while (true) {
        const packagePath = path.join(currentDir, 'node_modules', moduleName);
        if (fss.existsSync(packagePath)) {
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
//# sourceMappingURL=tools.js.map