import cssModuleCompiler from "./cssModuleCompiler.ts";

// Note: Bun.js plugins are partially compatible with EsBuild modules.

export const cssModuleHandler: Bun.OnLoadCallback = async ({path}) => {
    let jsSource = await cssModuleCompiler(path);

    return {
        contents: jsSource,
        loader: "js",
    };
};