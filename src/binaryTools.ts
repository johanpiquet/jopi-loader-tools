import path from "node:path";
import fs from "node:fs";
import {spawn} from "node:child_process";

const FORCE_LOG = false;

export function jopiLauncherTool(jsEngine: string) {
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

    function run() {
        // Here first is node.js, second is jopi. (it's du to shebang usage).
        const argv = process.argv.slice(2);

        let toPreload = getPreloadModules();
        toPreload = ["jopi-loader", ...toPreload];

        let preloadArgs: string[] = [];

        // We need the absolute path.
        toPreload.forEach(pkg => {
            const pkgPath = findModuleDir(pkg);
            if (!pkgPath) return;

            let foundPath = getRelativePath(findModuleEntryPoint(pkgPath));
            if (isWin32) foundPath = convertWin32ToLinuxPath(foundPath);

            if (foundPath) {
                preloadArgs.push(importFlag);
                preloadArgs.push(foundPath);
            }
        });

        let cmd = findExecutable(jsEngine, jsEngine)!;
        if (mustLog) console.log("Jopi - Using " + jsEngine + " from:", cmd);
        let args = [...preloadArgs, ...argv];

        const cwd = process.cwd();

        if (mustLog) console.log("Use current working dir:", cwd);
        if (mustLog) console.log("Jopi - Executing:", cmd, ...args);

        let useShell = cmd.endsWith('.cmd') || cmd.endsWith('.bat') || cmd.endsWith('.sh');
        const child = spawn(cmd, args, {stdio: 'inherit', cwd, shell: useShell});

        child.on('exit', (code, signal) => {
            if (signal) process.kill(process.pid, signal);
            else process.exit(code ?? 0);
        });

        child.on('error', (err) => {
            console.error(err.message || String(err));
            process.exit(1);
        });
    }

    const VERSION = "v1.1.1"
    const mustLog = process.env.JOPI_LOG || FORCE_LOG;
    const importFlag = jsEngine === "node" ? "--import" : "--preload";
    const isWin32 = path.sep === '\\';

    if (mustLog) console.log("Jopi version:", VERSION);

    const knowPackagesToPreload = ["jopi-rewrite"];

    run();
}

/**
 * Transform an absolute path to a relative path.
 */
function getRelativePath(absolutePath: string, fromPath: string = process.cwd()) {
    return path.relative(fromPath, absolutePath);
}

/**
 * Convert a simple win32 path to a linux path.
 */
function convertWin32ToLinuxPath(filePath: string) {
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
function findExecutable(cmd: string, ifNotFound: string|null): string|null {
    const paths = (process.env.PATH || '').split(path.delimiter);

    if (process.platform === 'win32') {
        const extToTest = process.env.PATHEXT ? process.env.PATHEXT.split(';') : ['.EXE', '.CMD', '.BAT'];

        for (const p of paths) {
            for (const ext of extToTest) {
                const full = path.join(p, cmd + ext.toLowerCase());
                if (fs.existsSync(full)) return full;

                const fullUpper = path.join(p, cmd + ext);
                if (fs.existsSync(fullUpper)) return fullUpper;
            }
        }
    } else {
        for (const p of paths) {
            const full = path.join(p, cmd);
            if (fs.existsSync(full)) return full;

            const fullUpper = path.join(p, cmd);
            if (fs.existsSync(fullUpper)) return fullUpper;
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
function findPackageJson(): string|null {
    if (gPackageJsonPath!==undefined) return gPackageJsonPath;

    let currentDir = process.cwd();

    while (true) {
        const packagePath = path.join(currentDir, 'package.json');

        if (fs.existsSync(packagePath)) return gPackageJsonPath = packagePath;

        const parentDir = path.dirname(currentDir);

        // Reached root directory
        if (parentDir === currentDir) break;

        currentDir = parentDir;
    }

    return null;
}

/**
 * Search the entry point of the current package (ex: ./dist/index.json)
 * @param nodeModuleDir - The path of the current module.
 * @returns Returns the full path of the script.
 */
function findModuleEntryPoint(nodeModuleDir: string): string {
    const packageJsonPath = path.join(nodeModuleDir, 'package.json');

    // >>> Try to take the "main" information inside the package.json.

    if (fs.existsSync(packageJsonPath)) {
        try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

            if (packageJson.main) {
                const mainPath = path.join(nodeModuleDir, packageJson.main);
                if (fs.existsSync(mainPath)) return mainPath;
            }
        } catch {
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
        if (fs.existsSync(fullPath)) return fullPath;
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
function findModuleDir(moduleName: string): string|null {
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

let gPackageJsonPath: string|null|undefined;
