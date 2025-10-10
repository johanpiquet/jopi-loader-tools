import path from "node:path";
import * as sass from "sass";
import fs from "node:fs/promises";
import postcssModules from "postcss-modules";
import postcss from "postcss";
import postcssUrl from "postcss-url";

import NodeSpace from "jopi-node-space";
import {getVirtualUrlForFile} from "./virtualUrl.js";
const nFS = NodeSpace.fs;

/**
 * Compile a CSS or SCSS file to a JavaScript file.
 *
 * --- Limitations ---
 * The current version doesn't support images and resources reference.
 * If a ref to an image / font / is embedded, then it will not be included.
 */
export default async function compileCssModule(filePath: string): Promise<string> {
    // Occurs when it's compiled with TypeScript.
    if (!await nFS.isFile(filePath)) {
        let source = NodeSpace.app.searchSourceOf(filePath)!;
        if (!source) throw new Error(`Source not found for file not found: ${filePath}`);
        filePath = source;
    }

    const ext = path.extname(filePath).toLowerCase();

    let css: string;
    let fromPath = filePath;

    if (ext === ".scss") {
        // Compile SCSS to CSS
        css = scssToCss(filePath);
        fromPath = filePath.replace(/\.scss$/i, '.css');
    } else {
        css = await fs.readFile(filePath, 'utf-8');
    }

    // Process with PostCSS and css-modules
    let knownClassNames: Record<string, string> = {};

    // Contains virtual urls for resources inside the CSS.
    let virtualUrlSourceFiles: string[] = [];

    try {
        const plugins = [
            // Will allow detecting internal url and replace url with a virtual url
            // allowing to resolve the dependencies (from bundler or direct location).
            //
            postcssUrl({
                url: (asset) => {
                    if (asset.url.startsWith('/') || asset.url.startsWith('./')) {
                        if (asset.absolutePath) {
                            const virtualUrl = getVirtualUrlForFile(asset.absolutePath!);
                            if (virtualUrl) virtualUrlSourceFiles.push(virtualUrl.sourceFile);
                            if (virtualUrl) return virtualUrl.url;
                        }
                    }

                    return asset.url;
                }
            }),

            postcssModules({
                // The format of the classnames.
                generateScopedName: '[name]__[local]',
                localsConvention: 'camelCaseOnly',

                // Allow capturing the class names.
                getJSON: (_cssFileName: string, json: Record<string, string>) => {
                    knownClassNames = json || {};
                }
            })
        ];

        let res = await postcss(plugins).process(css, {from: fromPath, map: false});
        css = res.css;

    } catch (e: any) {
        console.warn("jopi-loader - PostCSS processing failed:", e?.message || e);
        throw e;
    }

    knownClassNames.__CSS__ = css;
    knownClassNames.__FILE_HASH__ = NodeSpace.crypto.md5(filePath);

    // Here __TOKENS__ contain something like {myLocalStyle: "LocalStyleButton__myLocalStyle___n1l3e"}.
    // The goal is to resolve the computed class name and the original name.

    // To known: we don't execute in the same process as the source code.
    // It's why we can't directly call registerCssModule.

    if (process.env.JOPI_BUNLDER_ESBUILD) {
        return `export default ${JSON.stringify(knownClassNames)};`;
    }

    return `
        const virtualUrls = ${JSON.stringify(virtualUrlSourceFiles)};
        if (global.jopiAddVirtualUrlFor) virtualUrls.forEach(global.jopiAddVirtualUrlFor);
        export default ${JSON.stringify(knownClassNames)};
    `;
}

export function scssToCss(filePath: string): any {
    const res = sass.compile(filePath, { style: 'expanded' });
    return res.css.toString();
}