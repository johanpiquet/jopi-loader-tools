import "jopi-node-space";
import fss from "node:fs";
export declare function getFileStat(filePath: string): Promise<fss.Stats | undefined>;
export declare function isFile(filePath: string): Promise<boolean>;
/**
 * Search the source of the component if it's a JavaScript and not a TypeScript.
 * Why? Because EsBuild doesn't work well on already transpiled code.
 */
export declare function searchSourceOf(scriptPath: string): Promise<string>;
/**
 * Find the full path of an executable (like the which/where command).
 * Automatically add ".exe" / ".cmd" / ".bat" for windows.
 *
 * @param cmd - The name of the executable to search.
 * @param ifNotFound - What to return if not found.
 * @returns - The full path of the executable, or the name of the command if not found.
 */
export declare function findExecutable(cmd: string, ifNotFound: string | null): string | null;
/**
 * Transform an absolute path to a relative path.
 */
export declare function getRelativePath(absolutePath: string, fromPath?: string): string;
/**
 * Convert a simple win32 path to a linux path.
 */
export declare function convertWin32ToLinuxPath(filePath: string): string;
/**
 * Search the package.json file for the currently executing script.
 * Use the current working dir and search in parent directories.
 *
 * @return - Returns the full path of the file 'package.json' or null.
 */
export declare function findPackageJson(): string | null;
/**
 * Search the entry point of the current package (ex: ./dist/index.json)
 * @param nodeModuleDir - The path of the current module.
 * @returns Returns the full path of the script.
 */
export declare function findModuleEntryPoint(nodeModuleDir: string): string;
/**
 * Searches for the directory of a specified module.
 *
 * @param moduleName - The name of the module to find.
 * @return The path to the module directory if found, or null if not found.
 */
export declare function findModuleDir(moduleName: string): string | null;
