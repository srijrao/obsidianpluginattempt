// FileListTool.ts
// Tool for listing files in a specified folder in the vault
import { TFile, TFolder, Vault } from 'obsidian';

export class FileListTool {
    static toolName = 'file_list';
    static description = 'List all files in a specified folder in the vault';
    static parameters = {
        folderPath: { type: 'string', description: 'Path to the folder (relative to vault root)', required: true },
        recursive: { type: 'boolean', description: 'Whether to list files recursively', default: false }
    };

    app: any;
    constructor(app: any) {
        this.app = app;
    }

    async run(params: { folderPath: string; recursive?: boolean }) {
        const { folderPath, recursive = false } = params;
        const vault: Vault = this.app.vault;
        const folder = vault.getAbstractFileByPath(folderPath);
        if (!folder || !(folder instanceof TFolder)) {
            throw new Error('Folder not found: ' + folderPath);
        }
        const files: string[] = [];
        const walk = (f: TFolder) => {
            for (const child of f.children) {
                if (child instanceof TFile) {
                    files.push(child.path);
                } else if (recursive && child instanceof TFolder) {
                    walk(child);
                }
            }
        };
        walk(folder);
        return files;
    }
}
