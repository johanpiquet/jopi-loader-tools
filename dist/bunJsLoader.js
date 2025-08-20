import { supportedExtensionsRegExp } from "./rules.js";
import { transformFile } from "./transform.js";
// https://bun.com/docs/runtime/plugins
export function installBunJsLoader() {
    Bun.plugin({
        name: "jopi-loader",
        setup(build) {
            build.onLoad({ filter: supportedExtensionsRegExp }, jopiHandler);
        },
    });
}
const jopiHandler = async ({ path }) => {
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
};
//# sourceMappingURL=bunJsLoader.js.map