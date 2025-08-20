function toFlatList(rec: Record<string, string[]>): string[] {
    let res: string[] = [];

    for (let group in rec) {
        res = [...res, ...rec[group]]
    }

    return res;
}

function invertKeys(rec: Record<string, string[]>): Record<string, string> {
    const res: Record<string, string> = {};

    for (let key in rec) {
        let group = rec[key];
        group.forEach(e => {res[e] = key});
    }

    return res;
}

const supportedExtensionsByGroup = {
    css: [".css", ".scss"],
    binary: [".jpg", ".png", ".jpeg", ".gif", ".webp", ".woff", ".woff2", ".ttf", ".avif", ".ico"],
    text: [".text",".svg", ".glsl"]
};

export const supportedExtensions = toFlatList(supportedExtensionsByGroup);
export const supportedExtensionToType = invertKeys(supportedExtensionsByGroup);

export const supportedExtensionsRegExp = new RegExp(`(${supportedExtensions.map(ext => ext.replace('.', '\\.')).join('|')})(?:\\?.*)?$`);

