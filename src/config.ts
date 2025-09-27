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
     *
     * The value here must be the PUBLIC url.
     */
    webSiteUrl?: string;

    /**
     * It's the url on which the website listens if we don't use
     * explicite url when defining the website.
     *
     * Here it's the PRIVATE url.
     *
     * If not defined, take the value of webSiteUrl.
     */
    webSiteListeningUrl?: string;

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

let gTransformConfig: PackageJson_jopi|undefined;

export function getImportTransformConfig(): PackageJson_jopi {
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

            if (jopi) {
                let webSiteUrl = jopi.webSiteUrl;
                if (webSiteUrl && !webSiteUrl.endsWith("/")) webSiteUrl += '/';

                let webSiteListeningUrl = jopi.webSiteListeningUrl;
                if (!webSiteListeningUrl) webSiteListeningUrl = webSiteUrl;
                if (webSiteListeningUrl && !webSiteListeningUrl.endsWith("/")) webSiteListeningUrl += '/';

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

                if (webSiteUrl) {
                    bundlerOutputDir = path.join(bundlerOutputDir, urlToPath(webSiteUrl));
                }

                bundlerOutputDir = path.resolve(bundlerOutputDir);

                gTransformConfig = {
                    webSiteUrl, webSiteListeningUrl,
                    webResourcesRoot: root,
                    inlineMaxSize_ko,
                    bundlerOutputDir
                };
            }
        } catch {
        }
    } else {
        gTransformConfig =  {
            webResourcesRoot: "_bundle",
            inlineMaxSize_ko: INLINE_MAX_SIZE_KO,
            bundlerOutputDir: "./temp/.reactHydrateCache"
        }
    }

    return gTransformConfig!;
}