import path from "node:path";
import {dirname, resolve as resolvePath} from "path";
import {fileURLToPath} from "url";
import type { ResolveHook, ResolveFnOutput } from 'node:module';
import {findPackageJson, searchSourceOf} from "./tools.js";
import stripJsonComments from 'strip-json-comments';

import "jopi-node-space";
const nFS = NodeSpace.fs;

const declaredAliases: Record<string, string> = {
    //'@/lib/': 'src/shadcn/lib/',
};

let rootDir = "";

async function initialize() {
    gIsInitialized = true;

    let pkgJsonFile = findPackageJson();
    if (!pkgJsonFile) throw new Error("Package.json not found");

    let pkgJsonDir = path.dirname(pkgJsonFile);
    rootDir = pkgJsonDir;

    let tsconfigJsonPath = path.join(pkgJsonDir, "tsconfig.json");

    if (!await nFS.isFile(tsconfigJsonPath)) {
        throw new Error(`tsconfig.json not found at ${tsconfigJsonPath}`);
    }

    let asText = await nFS.readTextFromFile(tsconfigJsonPath);
    let asJson = JSON.parse(stripJsonComments(asText));

    let compilerOptions = asJson.compilerOptions;

    if (compilerOptions) {
        let paths = compilerOptions.paths;

        /** Exemple
         * "paths": {
         *       "@/*": ["./src/shadcn/*"],
         *       "@/lib/*": ["./src/shadcn/lib/*"],
         *       "@/components/*": ["./src/shadcn/components/*"]
         *     }
         */

        for (let alias in paths) {
            let pathAlias = paths[alias].pop() as string;
            if (!pathAlias) continue;

            if (alias.endsWith("*")) alias = alias.substring(0, alias.length - 1);
            if (pathAlias.endsWith("*")) pathAlias = pathAlias.substring(0, pathAlias.length - 1);

            if (!path.isAbsolute(pathAlias)) {
                pathAlias = resolvePath(rootDir, pathAlias);
            }

            if (!pathAlias.endsWith("/")) pathAlias += "/";


            declaredAliases[alias] = pathAlias;
        }
    }
}

let gIsInitialized = false;

/**
 * Allows resolving alias.
 * Example: import myComp from "@/lib/myComp".
 * The alias definitions are taken in the paths section of tsconfig.json.
 */
export const resolveNodeJsAlias: ResolveHook = async (specifier, context, nextResolve): Promise<ResolveFnOutput> => {
    if (!gIsInitialized) {
        await initialize();
    }

    for (const alias in declaredAliases) {
        if (specifier.startsWith(alias)) {
            let pathAlias = declaredAliases[alias];
            const resolvedPath = specifier.replace(alias, pathAlias);

            // Add .js if missing.
            const filePath = resolvedPath.endsWith('.js') ? resolvedPath : `${resolvedPath}.js`;

            let parentPath = fileURLToPath(context.parentURL!);
            parentPath = await searchSourceOf(parentPath);

            const relPath = path.relative(dirname(parentPath), filePath);

            return nextResolve(relPath, context);
        }
    }

    return nextResolve(specifier, context);
}