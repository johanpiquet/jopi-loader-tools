import cssModuleCompiler from "./cssModuleCompiler.js";
// Note: Bun.js plugins are partially compatible with EsBuild modules.
export const cssModuleHandler = async ({ path }) => {
    let jsSource = await cssModuleCompiler(path);
    return {
        contents: jsSource,
        loader: "js",
    };
};
//# sourceMappingURL=esBuildPlugin.js.map