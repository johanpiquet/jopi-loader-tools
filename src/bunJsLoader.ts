import {supportedExtensionsRegExp} from "./rules.ts";
import {transformFile} from "./transform.ts";
import {installEsBuildPlugins} from "./esBuildPlugin.js";

// https://bun.com/docs/runtime/plugins

export function installBunJsLoader() {
    Bun.plugin({
        name: "jopi-loader",
        setup(build) {
            installEsBuildPlugins(build);
            build.onLoad({filter: supportedExtensionsRegExp}, jopiHandler);
        }
    });
}

const jopiHandler: Bun.OnLoadCallback = async ({path}) => {
    let idx = path.indexOf("?");
    let options = "";

    if (idx !== -1) {
        options = path.substring(idx + 1);
        path = path.substring(0, idx);
    }

    const res = await transformFile(path, options);

    return {
        contents: res.text,
        loader: "js",
    };
}