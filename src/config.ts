import {findPackageJson} from "./tools.ts";
import path from "node:path";

/**
 * The value of the "jopi" entry in package.json
 */
export interface PackageJson_jopi {
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

export const INLINE_MAX_SIZE_KO = 10;

let gTransformConfig: PackageJson_jopi|undefined|null;

export function getDefaultWebSiteUrl(throwErrorIfUnset = true): string {
    let config = getImportTransformConfig();

    if (!config || !config.webSiteUrl) {
        if (throwErrorIfUnset) {
            throw new Error(
                "You must set the webSiteUrl in the package.json file, section 'jopi'"
            )
        }

        return "";
    }

    return config.webSiteUrl;
}

export function getImportTransformConfig(): PackageJson_jopi|null {
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