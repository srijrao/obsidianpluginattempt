// toolcollect.ts
// Centralized dynamic tool loader for all agent tool consumers
import * as fs from 'fs';
import * as path from 'path';

export function getAllToolClasses(): any[] {
    const toolsDir = path.join(__dirname);
    let toolClasses: any[] = [];
    try {
        const files = fs.readdirSync(toolsDir).filter(f => (f.endsWith('Tool.ts') || f.endsWith('Tool.js')) && f !== 'toolcollect.ts' && f !== 'toolcollect.js');
        for (const file of files) {
            const toolModule = require(path.join(toolsDir, file));
            const className = Object.keys(toolModule).find(k => k.endsWith('Tool'));
            const ToolClass = toolModule.default || (className && toolModule[className]);
            if (ToolClass) {
                toolClasses.push(ToolClass);
            }
        }
    } catch (e) {
        // fallback: no tools found
    }
    return toolClasses;
}
