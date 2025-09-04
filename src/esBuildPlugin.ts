import cssModuleCompiler from "./cssModuleCompiler.ts";
import {isFile, searchSourceOf} from "./tools.js";
import {transformFile} from "./transform.js";

// Note: Bun.js plugins are partially compatible with EsBuild modules.

export const cssModuleHandler: Bun.OnLoadCallback = async ({path}) => {
    let jsSource = await cssModuleCompiler(path);

    return {
        contents: jsSource,
        loader: "js",
    };
};

export const inlineAndRawModuleHandler: Bun.OnLoadCallback = async (p) => {
    let resPath = p.path;
    let idx = resPath.indexOf("?");
    let options = "";

    if (idx !== -1) {
        options = resPath.substring(idx + 1);
        resPath = resPath.substring(0, idx);
    }

    // Occurs when it's compiled with TypeScript.
    if (!await isFile(resPath)) {
        resPath = await searchSourceOf(resPath);
    }

    let res = await transformFile(resPath, options);

    return {
        contents: res.text,
        loader: "js",
    };
};