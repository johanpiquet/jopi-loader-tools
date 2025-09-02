import cssModuleCompiler from "./cssModuleCompiler.ts";
import {supportedExtensionToType} from "./rules.ts";
import path from "node:path";
import fs from "node:fs/promises";

import "jopi-node-space";
import {findPackageJson} from "./tools.js";
import {getAssetsHash} from "@jopi-loader/client";

const nFS = NodeSpace.fs;

export interface TransformResult {
    text: string;
    type: "js"|"text"
}

export async function transformFile(filePath: string, options: string): Promise<TransformResult> {
    let text: string;

    if (options=="raw") {
        text = await transform_raw(filePath);
    } else if (options==="inline") {
        text = await transform_inline(filePath);
    }
    else if (filePath.endsWith(".module.css") || (filePath.endsWith(".module.scss"))) {
        text = await transform_cssModule(filePath);
    } else if (filePath.endsWith(".css") || (filePath.endsWith(".scss"))) {
        text = await transform_css(filePath);
    } else {
        text = await transform_filePath(filePath);
    }

    return {text, type: "js"};
}

async function transform_cssModule(filePath: string) {
    return await cssModuleCompiler(filePath);
}

async function transform_css(filePath: string) {
    return `const __PATH__ = ${JSON.stringify(filePath)};
if (global.jopiOnCssImported) global.jopiOnCssImported(__PATH__);
export default __PATH__;`
}

async function transform_filePath(filePath: string) {
    const config = await getTransformConfig();

    if (config) {
        let fileExtension = path.extname(filePath);
        let fileNameWithoutExt = path.basename(filePath).slice(0, -fileExtension.length);
        filePath = config.webSiteUrl + config.webResourcesRoot + fileNameWithoutExt + '-' + getAssetsHash() + fileExtension;
    }

    return `const __PATH__ = ${JSON.stringify(filePath)}; export default __PATH__;`;
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

interface TransformConfig {
    webSiteUrl: string;
    webResourcesRoot: string;
}

let gTransformConfig: undefined|null|TransformConfig;

async function getTransformConfig(): Promise<TransformConfig|undefined|null> {
    if (gTransformConfig!==undefined) return gTransformConfig;
    let pkgJson = findPackageJson();

    if (pkgJson) {
        try {
            let json = JSON.parse(await NodeSpace.fs.readTextFromFile(pkgJson));
            let jopi = json.jopi;

            if (jopi && jopi.webSiteUrl) {
                let url = jopi.webSiteUrl;
                if (!url.endsWith("/")) url += '/';

                let root = jopi.webResourcesRoot || "_bundle";
                if (root[0]==='/') root = root.substring(1);
                if (!root.endsWith("/")) root += "/";

                return gTransformConfig = {
                    webSiteUrl: url,
                    webResourcesRoot: root
                };
            }
        } catch {

        }
    }

    return gTransformConfig = null;
}