import path from "node:path";
import {dirname, resolve as resolvePath} from "path";
import {fileURLToPath} from "url";
import type { ResolveHook, ResolveFnOutput } from 'node:module';
import stripJsonComments from 'strip-json-comments';

import NodeSpace from "jopi-node-space";
const nFS = NodeSpace.fs;

const declaredAliases: Record<string, string> = {
    //'@/lib/': 'src/shadcn/lib/',
};

let rootDir = "";

async function initialize() {
    gIsInitialized = true;

    let pkgJsonFile = NodeSpace.app.findPackageJson();
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

            if (!alias.endsWith("/")) alias += "/";
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

    let foundAlias = "";

    for (const alias in declaredAliases) {
        if (specifier.startsWith(alias)) {
            if (foundAlias.length<alias.length) {
                foundAlias = alias;
            }
        }
    }

    if (foundAlias) {
        let pathAlias = declaredAliases[foundAlias];
        const resolvedPath = specifier.replace(foundAlias, pathAlias);

        // Add .js if missing.
        const filePath = resolvedPath.endsWith('.js') ? resolvedPath : `${resolvedPath}.js`;

        let parentPath = fileURLToPath(context.parentURL!);
        parentPath = NodeSpace.app.requireSourceOf(parentPath);

        const relPath = path.relative(dirname(parentPath), filePath);

        return nextResolve(relPath, context);
    }

    return nextResolve(specifier, context);
}