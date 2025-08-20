export declare function getFileStat(filePath: string): Promise<import("fs").Stats | undefined>;
export declare function isFile(filePath: string): Promise<boolean>;
/**
 * Search the source of the component if it's a JavaScript and not a TypeScript.
 * Why? Because EsBuild doesn't work well on already transpiled code.
 */
export declare function searchSourceOf(scriptPath: string): Promise<string>;
