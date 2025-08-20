import { isFile, searchSourceOf } from "./tools.js";
import path from "node:path";
import * as sass from "sass";
import fs from "node:fs/promises";
import postcssModules from "postcss-modules";
import postcss from "postcss";
/**
 * Compile a CSS or SCSS file to a JavaScript file.
 */
export default async function compileScss(filePath) {
    // Occurs when it's compiled with TypeScript.
    if (!await isFile(filePath)) {
        filePath = await searchSourceOf(filePath);
    }
    const ext = path.extname(filePath).toLowerCase();
    let css;
    let fromPath = filePath;
    if (ext === ".scss") {
        // Compile SCSS to CSS
        css = scssToCss(filePath);
        fromPath = filePath.replace(/\.scss$/i, '.css');
    }
    else {
        css = await fs.readFile(filePath, 'utf-8');
    }
    // Process with PostCSS and css-modules
    let knownClassNames = {};
    try {
        const plugins = [
            postcssModules({
                // The format of the classnames.
                generateScopedName: '[name]__[local]',
                localsConvention: 'camelCaseOnly',
                // Allow capturing the class names.
                getJSON: (_cssFileName, json) => {
                    knownClassNames = json || {};
                }
            })
        ];
        let res = await postcss(plugins).process(css, { from: fromPath, map: false });
        css = res.css;
    }
    catch (e) {
        console.warn("jopi-loader - PostCSS processing failed:", e?.message || e);
        throw e;
    }
    knownClassNames.__CSS__ = css;
    knownClassNames.__FILE_HASH__ = NodeSpace.crypto.md5(filePath);
    // Here __TOKENS__ contain something like {myLocalStyle: "LocalStyleButton__myLocalStyle___n1l3e"}.
    // The goal is to resolve the computed class name and the original name.
    // To known: we don't execute in the same process as the source code.
    // It's why we can't directly call registerCssModule.
    return `export default ${JSON.stringify(knownClassNames)};`;
}
export function scssToCss(filePath) {
    const res = sass.compile(filePath, { style: 'expanded' });
    return res.css.toString();
}
//# sourceMappingURL=cssModuleCompiler.js.map