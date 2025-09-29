import path from "node:path";
import NodeSpace from "jopi-node-space";

import fss from "node:fs";


/**
 * Convert a simple win32 path to a linux path.
 */
export function convertWin32ToLinuxPath(filePath: string) {
    return filePath.replace(/\\/g, '/');
}

/**
 * Search the entry point of the current package (ex: ./dist/index.json)
 * @param nodePackageDir - The path of the current module.
 * @returns Returns the full path of the script.
 */
export function findNodePackageEntryPoint(nodePackageDir: string): string {
    const packageJsonPath = path.join(nodePackageDir, 'package.json');

    // >>> Try to take the "main" information inside the package.json.

    if (fss.existsSync(packageJsonPath)) {
        try {
            const packageJson = JSON.parse(fss.readFileSync(packageJsonPath, 'utf8'));

            if (packageJson.main) {
                const mainPath = path.join(nodePackageDir, packageJson.main);
                if (fss.existsSync(mainPath)) return mainPath;
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
        const fullPath = path.join(nodePackageDir, commonPath);
        if (fss.existsSync(fullPath)) return fullPath;
    }

    // Default to dist/index.js
    return path.join(nodePackageDir, 'dist', 'index.js');
}

/**
 * Searches for the directory of a specified module.
 *
 * @param packageName - The name of the module to find.
 * @return The path to the module directory if found, or null if not found.
 */
export function finNodePackageDir(packageName: string): string|null {
    let currentDir = process.cwd();

    while (true) {
        const packagePath = path.join(currentDir, 'node_modules', packageName);

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