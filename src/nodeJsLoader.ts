import * as NodeModule from 'node:module';

import "jopi-node-space";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {isFile, searchSourceOf} from "./tools.ts";
import {supportedExtensions} from "./rules.ts";
import {transformFile} from "./transform.ts";

// Guard to avoid recursive self-registration when using Module.register(import.meta.url)
const __JOPI_LOADER_REGISTERED__ = Symbol.for('jopi-loader:registered');
const __g: any = globalThis as any;

if (!__g[__JOPI_LOADER_REGISTERED__]) {
    __g[__JOPI_LOADER_REGISTERED__] = true;

    // "register" allow async.
    NodeModule.register(import.meta.url as unknown as string);
}

export async function resolve(specifier: string, context: any, nextResolve: any) {
    async function tryResolveFile(filePath: string, moduleName: string) {
        if (await isFile(filePath)) {
            return nextResolve(moduleName, context);
        }

        return undefined;
    }

    async function tryResolveDirectory(url: string) {
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

    async function tryResolveModule(url: string) {
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
    if (idx!==-1) specifier = specifier.substring(0 ,idx);

    if (supportedExtensions.includes(path.extname(specifier))) {
        return {
            url: new URL(bckSpecifier, context.parentURL).href,
            format: "jopi-loader",
            shortCircuit: true
        };
    }

    try {
        return nextResolve(specifier, context);
    } catch (e: any) {
        if (e.code === "ERR_UNSUPPORTED_DIR_IMPORT") {
            return await tryResolveDirectory(e.url! as string);
        }
        if (e.code === "ERR_MODULE_NOT_FOUND") {
            return await tryResolveModule(e.url! as string);
        }
        throw e;
    }
}

// noinspection JSUnusedGlobalSymbols
export async function load(url: string, context: any, nextLoad: any) {
    if (context.format=== "jopi-loader") {
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

        let res = await transformFile(filePath, options);

        return {
            source: res.text,
            format: 'module',
            shortCircuit: true
        };
    }

    return nextLoad(url, context);
}