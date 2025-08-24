function toFlatList(rec) {
    let res = [];
    for (let group in rec) {
        res = [...res, ...rec[group]];
    }
    return res;
}
function invertKeys(rec) {
    const res = {};
    for (let key in rec) {
        let group = rec[key];
        group.forEach(e => { res[e] = key; });
    }
    return res;
}
const supportedExtensionsByGroup = {
    css: [".css", ".scss"],
    binary: [".jpg", ".png", ".jpeg", ".gif", ".webp", ".woff", ".woff2", ".ttf", ".avif", ".ico"],
    text: [".text", ".svg", ".glsl"]
};
export const supportedExtensions = toFlatList(supportedExtensionsByGroup);
export const supportedExtensionToType = invertKeys(supportedExtensionsByGroup);
export const supportedExtensionsRegExp = new RegExp(`(${supportedExtensions.map(ext => ext.replace('.', '\\.')).join('|')})(?:\\?.*)?$`);
//# sourceMappingURL=rules.js.map