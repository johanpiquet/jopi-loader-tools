export interface TransformResult {
    text: string;
    type: "js" | "text";
}
export declare function transformFile(filePath: string, options: string): Promise<TransformResult>;
