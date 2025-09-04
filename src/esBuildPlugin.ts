import cssModuleCompiler from "./cssModuleCompiler.ts";
import {isFile, searchSourceOf} from "./tools.js";
import {getTransformConfig, transformFile} from "./transform.js";
import path from "node:path";
import fs from "node:fs";

// Note: Bun.js plugins are partially compatible with EsBuild modules.

const cssModuleHandler: Bun.OnLoadCallback = async ({path}) => {
    let jsSource = await cssModuleCompiler(path);

    return {
        contents: jsSource,
        loader: "js",
    };
};

async function inlineAndRawModuleHandler(options: string, resPath: string) {
    // Occurs when it's compiled with TypeScript.
    if (!await isFile(resPath)) {
        resPath = await searchSourceOf(resPath);
    }

    let res = await transformFile(resPath, options);

    return {
        contents: res.text,
        loader: "js",
    };
}

export function resolveAndCheckPath(filePath: string, resolveDir: string): {path?: string, error?: string} {
    let absolutePath: string;

    if (path.isAbsolute(filePath)) {
        absolutePath = filePath;
    } else {
        absolutePath = path.resolve(resolveDir, filePath);
    }

    try {
        fs.accessSync(absolutePath);
        return { path: absolutePath };
    } catch (error) {
        return { error: `Resource not found: ${absolutePath}` };
    }
}

function getTempFileName() {
    return "mytempfilename.jopiraw"
}

export function installEsBuildPlugins(build: Bun.PluginBuilder, isBunJsLoader = false) {
    // @ts-ignore
    build.onResolve({filter: /\.(css|scss)$/}, async (args) => {
        const result = resolveAndCheckPath(args.path, path.dirname(args.importer));

        if (result.error) {
            return {
                errors: [{
                    text: result.error,
                    location: null,
                }]
            };
        }

        return {
            path: result.path
        };
    });

    // @ts-ignore
    build.onResolve({filter: /\?(?:inline|raw)$/}, async (args) => {
        let [filePath, option] = args.path.split('?');

        const result = resolveAndCheckPath(filePath, path.dirname(args.importer));

        if (result.error) {
            return {
                errors: [{
                    text: result.error
                }]
            };
        }

        filePath = result.path!;

        let options = getTransformConfig();
        let tempDir = options?.bundlerOutputDir || path.join("temp", "bunjs");
        fs.mkdirSync(tempDir, {recursive: true});

        let fileName = path.resolve(tempDir, getTempFileName());
        fs.writeFileSync(fileName, JSON.stringify({file: filePath, option: option}));

        // Bun.js load doesn't support having an '?' in the path.
        // It's why we do strange things here to process this case.
        //
        return {
            path: fileName
        };
    });

    // @ts-ignore
    build.onLoad({filter: /\.jopiraw$/},  async (args) => {
        let filePath = args.path;

        let json = JSON.parse(await NodeSpace.fs.readTextFromFile(filePath));
        await NodeSpace.fs.unlink(filePath);

        filePath = json.file;
        let option = json.option;

        try {
            return await inlineAndRawModuleHandler(option, filePath);
        }
        catch (e) {
            console.log("Error when bundling (option " + option + ")", e);
        }
    });

    // @ts-ignore
    build.onLoad({ filter: /\.(css|scss)$/ }, cssModuleHandler);
}