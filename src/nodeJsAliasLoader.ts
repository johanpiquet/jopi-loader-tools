import type { ResolveHook, ResolveFnOutput } from 'node:module';

import {pathToFileURL} from "node:url";
import {getCompiledFilePathFor} from "jopi-node-space/dist/_app.js";
import {getPathAliasInfo, type PathAliasInfo} from "./tools.js";

const LOG = process.env.JOPI_LOGS === "1";

/**
 * Allows resolving alias.
 * Example: import myComp from "@/lib/myComp".
 * The alias definitions are taken in the paths section of tsconfig.json.
 */
export const resolveNodeJsAlias: ResolveHook = async (specifier, context, nextResolve): Promise<ResolveFnOutput> => {
    if (!gPathAliasInfos) {
        gPathAliasInfos = await getPathAliasInfo();
    }

    let foundAlias = "";

    for (const alias in gPathAliasInfos.alias) {
        if (specifier.startsWith(alias)) {
            if (foundAlias.length<alias.length) {
                foundAlias = alias;
            }
        }
    }

    if (foundAlias) {
        if (LOG) console.log(`jopi-loader - Found alias ${foundAlias} for resource ${specifier}`);

        let pathAlias = gPathAliasInfos.alias[foundAlias];
        const resolvedPath = specifier.replace(foundAlias, pathAlias);

        let filePath = resolvedPath.endsWith('.js') ? resolvedPath : `${resolvedPath}.js`;
        filePath = getCompiledFilePathFor(filePath);

        return nextResolve(pathToFileURL(filePath).href, context);
    }

    return nextResolve(specifier, context);
}

let gPathAliasInfos: PathAliasInfo|undefined;
