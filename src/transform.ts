import cssModuleCompiler from "./cssModuleCompiler.ts";
import {supportedExtensionToType} from "./rules.ts";
import path from "node:path";
import fs from "node:fs/promises";

import NodeSpace from "jopi-node-space";
import {getImportTransformConfig, INLINE_MAX_SIZE_KO} from "./config.ts";

const nFS = NodeSpace.fs;
const nCrypto = NodeSpace.crypto;

export interface TransformResult {
    text: string;
    type: "js"|"text"
}

export async function transformFile(filePath: string, options: string): Promise<TransformResult> {
    let text: string;

    if (filePath.endsWith(".json")) {
        // .json must be ignored with bun.js since some libraries use require and not import.
        // The matter is that the generated code can't be compatible with import and require
        // at the same time.
        //
        // Moreover, bun.js natif implementation seems way faster.
        //
        text = await transform_json(filePath);
    }
    else if (options=="raw") {
        text = await transform_raw(filePath);
    }
    else if (options==="inline") {
        text = await transform_inline(filePath);
    }
    else if (filePath.endsWith(".module.css") || (filePath.endsWith(".module.scss"))) {
        text = await transform_cssModule(filePath);
    }
    else if (filePath.endsWith(".css") || (filePath.endsWith(".scss"))) {
        text = await transform_css(filePath);
    }
    else {
        text = await transform_filePath(filePath);
    }

    return {text, type: "js"};
}

async function transform_cssModule(filePath: string) {
    return await cssModuleCompiler(filePath);
}

async function transform_css(sourceFilePath: string) {
    let resUrlInfos = await getResourceUrlInfos(sourceFilePath);

    if (resUrlInfos.file) {
        return `const __PATH__ = ${JSON.stringify(resUrlInfos.file)}; export default __PATH__;`
    }

    return `const __URL__ = ${JSON.stringify(resUrlInfos.url)};
if (global.jopiAddMappedUrl) global.jopiAddMappedUrl(${JSON.stringify(resUrlInfos.route)}, ${JSON.stringify(sourceFilePath)}, true);
export default __URL__;`
}

async function transform_filePath(sourceFilePath: string) {
    let resUrlInfos = await getResourceUrlInfos(sourceFilePath);

    if (resUrlInfos.file) {
        return `const __PATH__ = ${JSON.stringify(resUrlInfos.file)}; export default __PATH__;`
    }

    return `const __URL__ = ${JSON.stringify(resUrlInfos.url)};
if (global.jopiAddMappedUrl) global.jopiAddMappedUrl(${JSON.stringify(resUrlInfos.route)}, ${JSON.stringify(sourceFilePath)}, false);
export default __URL__;`;
}

async function transform_json(filePath: string) {
    const resText = await nFS.readTextFromFile(filePath);
    return `export default ${resText};`;
}

async function transform_raw(filePath: string) {
    let ext = path.extname(filePath);
    let type = supportedExtensionToType[ext];
    if (!type) type = "text";

    let resText: string;

    if ((type==="text")||(type==="css")) {
        resText = await nFS.readTextFromFile(filePath);
    } else {
        const buffer: Buffer = await fs.readFile(filePath);

        // Here there is no the prefix "data:image/jpeg;base64".
        // It's the difference with the "?inline" option.
        //
        resText = buffer.toString('base64');
    }

    return `export default  ${JSON.stringify(resText)};`
}

async function transform_inline(filePath: string) {
    let ext = path.extname(filePath);
    let type = supportedExtensionToType[ext];
    if (!type) type = "text";

    let resText: string;

    if ((type==="text")||(type==="css")) {
        resText = await nFS.readTextFromFile(filePath);
    } else {
        const config = getImportTransformConfig();
        let maxSize = config ? config.inlineMaxSize_ko : INLINE_MAX_SIZE_KO;

        let fileSize = Math.trunc(await nFS.getFileSize(filePath) / 1024);

        if (fileSize > maxSize) {
            return transform_filePath(filePath);
        }

        const buffer: Buffer = await fs.readFile(filePath);
        const mimeType = nFS.getMimeTypeFromName(filePath);

        // Here there is no the prefix "data:image/jpeg;base64".
        // It's the difference with the "?inline" option.
        //
        resText = buffer.toString('base64');
        resText = `data:${mimeType};base64,${resText}`;
    }

    return `export default ${JSON.stringify(resText)};`
}

async function getResourceUrlInfos(sourceFilePath: string): Promise<{file?: string, route?: string, url?: string}> {
    const config = getImportTransformConfig();

    if (config && config.webSiteUrl) {
        let route = path.relative(process.cwd(), sourceFilePath);
        route = config.webResourcesRoot_SSR + nCrypto.md5(route) + path.extname(sourceFilePath);

        return {
            url: config.webSiteUrl + route,
            route: "/" + route
        };
    }

    return {
        file: sourceFilePath
    };
}
