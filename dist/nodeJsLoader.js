import "jopi-node-space";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { isFile, searchSourceOf } from "./tools.js";
import { supportedExtensions } from "./rules.js";
import { transformFile } from "./transform.js";
export async function doNodeJsResolve(specifier, context, nextResolve) {
    async function tryResolveFile(filePath, moduleName) {
        if (await isFile(filePath)) {
            return nextResolve(moduleName, context);
        }
        return undefined;
    }
    async function tryResolveDirectory(url) {
        const basePath = fileURLToPath(url);
        let basename = path.basename(basePath);
        let allFilesToTry = ["index.js", basename + ".cjs.js", basename + ".js"];
        for (let fileToTry of allFilesToTry) {
            const res = await tryResolveFile(path.join(basePath, fileToTry), specifier + "/" + fileToTry);
            if (res) {
                return res;
            }
        }
        // Will throw an error.
        return nextResolve(specifier, context);
    }
    async function tryResolveModule(url) {
        const basePath = fileURLToPath(url);
        const res = await tryResolveFile(basePath + ".js", specifier + ".js");
        if (res) {
            return res;
        }
        // Will throw an error.
        return nextResolve(specifier, context);
    }
    // Remove what is after the "?" to be able to test the extension.
    //
    const bckSpecifier = specifier;
    let idx = specifier.indexOf("?");
    if (idx !== -1)
        specifier = specifier.substring(0, idx);
    if (supportedExtensions.includes(path.extname(specifier))) {
        return {
            url: new URL(bckSpecifier, context.parentURL).href,
            format: "jopi-loader",
            shortCircuit: true
        };
    }
    try {
        return nextResolve(specifier, context);
    }
    catch (e) {
        if (e.code === "ERR_UNSUPPORTED_DIR_IMPORT") {
            return await tryResolveDirectory(e.url);
        }
        if (e.code === "ERR_MODULE_NOT_FOUND") {
            return await tryResolveModule(e.url);
        }
        throw e;
    }
}
// noinspection JSUnusedGlobalSymbols
export async function doNodeJsLoad(url, context, nextLoad) {
    if (context.format === "jopi-loader") {
        let idx = url.indexOf("?");
        let options = "";
        if (idx !== -1) {
            options = url.substring(idx + 1);
            url = url.substring(0, idx);
        }
        let filePath = fileURLToPath(url);
        // Occurs when it's compiled with TypeScript.
        if (!await isFile(filePath)) {
            filePath = await searchSourceOf(filePath);
        }
        try {
            let res = await transformFile(filePath, options);
            return {
                source: res.text,
                format: 'module',
                shortCircuit: true
            };
        }
        catch (e) {
            console.warn("jopi-loader - Error while loading:", e?.message || e);
            throw "jopi-loader - error";
        }
    }
    return nextLoad(url, context);
}
//# sourceMappingURL=nodeJsLoader.js.map