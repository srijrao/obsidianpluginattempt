import * as fs from "fs";
import * as path from "path";

/**
 * Deletes all files in the ai-calls folder inside the plugin directory.
 * @param pluginFolder The absolute path to the plugin folder (e.g., __dirname from a plugin file).
 * @param subfolder The subfolder to clear (default: "ai-calls").
 * @returns {Promise<number>} The number of files deleted.
 */
export async function clearAICallLogs(pluginFolder: string, subfolder: string = "ai-calls"): Promise<number> {
    const targetFolder = path.join(pluginFolder, subfolder);
    if (!fs.existsSync(targetFolder)) return 0;
    const files = fs.readdirSync(targetFolder);
    let deleted = 0;
    for (const file of files) {
        const filePath = path.join(targetFolder, file);
        if (fs.lstatSync(filePath).isFile()) {
            fs.unlinkSync(filePath);
            deleted++;
        }
    }
    return deleted;
}
