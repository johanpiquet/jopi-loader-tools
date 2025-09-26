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

async function transform_css(filePath: string) {
    let resUrl = await getAndInstallResourcePath(filePath);

    return `const __PATH__ = ${JSON.stringify(resUrl)};
if (global.jopiOnCssImported) global.jopiOnCssImported(${JSON.stringify(filePath)});
export default ${JSON.stringify(resUrl)};`
}

async function getAndInstallResourcePath(sourceFilePath: string) {
    const config = getTransformConfig();

    if (config && config.webSiteUrl) {
        let fileExtension = path.extname(sourceFilePath);
        let fileNameWithoutExt = path.basename(sourceFilePath).slice(0, -fileExtension.length);
        let targetFileName = fileNameWithoutExt + '-' + getAssetsHash() + fileExtension;

        await installResourceToBundlerDir(sourceFilePath, targetFileName);
        return config.webSiteUrl + config.webResourcesRoot + targetFileName;
    } else {
        return sourceFilePath;
    }
}

async function transform_filePath(sourceFilePath: string) {
    let resUrl = await getAndInstallResourcePath(sourceFilePath);
    return `const __PATH__ = ${JSON.stringify(resUrl)}; export default __PATH__;`;
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
        const config = getTransformConfig();
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

async function installResourceToBundlerDir(resFilePath: string, destFileName: string) {
    if (!gTransformConfig || !gTransformConfig.bundlerOutputDir) return;
    let outputDir = gTransformConfig.bundlerOutputDir;

    await fs.mkdir(outputDir, { recursive: true });
    let destFilePath = path.join(outputDir, destFileName);

    await fs.copyFile(resFilePath, destFilePath);
}

/**
 * The value of the "jopi" entry in package.json
 */
interface PackageJson_jopi {
    /**
     * When importing a file, if this option is set, then
     * we will not return a file path on the filesystem
     * but an url pointing to this resource.
     */
    webSiteUrl: string;

    /**
     * Is used with `webSiteUrl` to known where
     * whe cas found the resource. Will allow installing
     * a file server.
     */
    webResourcesRoot: string;

    /**
     * File which size is over this limite
     * will not be inlined when option ?inline
     * is set in the 'import', but resolved as
     * a file path (or ulr).
     */
    inlineMaxSize_ko: number;

    /**
     * Indicate the directory where the bundler
     * stores the images and resources.
     * (use linux path format)
     */
    bundlerOutputDir: string;
}

const INLINE_MAX_SIZE_KO = 10;

let gTransformConfig: undefined|null|PackageJson_jopi;

export function getTransformConfig(): PackageJson_jopi|undefined|null {
    function urlToPath(url: string) {
        let urlInfos = new URL(url);
        let port = urlInfos.port;

        if (port.length && port[0]!==':') port = ':' + port;
        return (urlInfos.hostname + port).replaceAll(".", "_").replaceAll(":", "_");
    }

    if (gTransformConfig!==undefined) return gTransformConfig;
    let pkgJson = findPackageJson();

    if (pkgJson) {
        try {
            let json = JSON.parse(NodeSpace.fs.readTextSyncFromFile(pkgJson));
            let jopi = json.jopi;

            if (jopi && jopi.webSiteUrl) {
                let url = jopi.webSiteUrl;
                if (!url.endsWith("/")) url += '/';

                let root = jopi.webResourcesRoot || "_bundle";
                if (root[0]==='/') root = root.substring(1);
                if (!root.endsWith("/")) root += "/";

                let inlineMaxSize_ko = INLINE_MAX_SIZE_KO;

                if (typeof(jopi.inlineMaxSize_ko)=="number") {
                    inlineMaxSize_ko = jopi.inlineMaxSize_ko;
                }

                let bundlerOutputDir = root.bundlerOutputDir;
                //
                if (!bundlerOutputDir) {
                    bundlerOutputDir = "./temp/.reactHydrateCache";
                }

                if (path.sep!=="/") {
                    bundlerOutputDir = bundlerOutputDir.replaceAll("/", path.sep);
                }

                if (url) {
                    bundlerOutputDir = path.join(bundlerOutputDir, urlToPath(url));
                }

                bundlerOutputDir = path.resolve(bundlerOutputDir);

                return gTransformConfig = {
                    webSiteUrl: url,
                    webResourcesRoot: root,
                    inlineMaxSize_ko,
                    bundlerOutputDir
                };
            }
        } catch {
        }
    }

    return gTransformConfig = null;
}