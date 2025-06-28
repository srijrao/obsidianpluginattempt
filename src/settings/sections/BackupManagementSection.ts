import { App, Setting, Notice, TFolder, TFile } from 'obsidian';
import MyPlugin from '../../main';
import { SettingCreators } from '../components/SettingCreators';
import { CollapsibleSectionRenderer } from '../../components/chat/CollapsibleSection';
import { DialogHelpers } from '../components/DialogHelpers'; // Import DialogHelpers

export class BackupManagementSection {
    private plugin: MyPlugin;
    private settingCreators: SettingCreators;

    constructor(plugin: MyPlugin, settingCreators: SettingCreators) {
        this.plugin = plugin;
        this.settingCreators = settingCreators;
    }

    async render(containerEl: HTMLElement): Promise<void> {
        await this.renderBackupManagement(containerEl);
        await this.renderTrashManagement(containerEl);
    }

    /**
     * Renders the Backup Management section.
     * @param containerEl The HTML element to append the section to.
     */
    private async renderBackupManagement(containerEl: HTMLElement): Promise<void> {
        containerEl.createEl('h3', { text: 'Backup Management' });
        containerEl.createEl('div', {
            text: 'Manage backups created when files are modified by AI tools. Backups are stored in the plugin data folder, not in your vault.',
            cls: 'setting-item-description',
            attr: { style: 'margin-bottom: 1em;' }
        });

        const backupManager = this.plugin.backupManager;

        // Show backup statistics
        const totalBackups = await backupManager.getTotalBackupCount();
        const totalSize = await backupManager.getTotalBackupSize();
        const sizeInKB = Math.round(totalSize / 1024);
          containerEl.createEl('div', {
            text: `Total backups: ${totalBackups} (${sizeInKB} KB)`,
            cls: 'setting-item-description',
            attr: { style: 'margin-bottom: 1em; font-weight: bold;' }
        });

        // Add refresh button
        const refreshButton = containerEl.createEl('button', {
            text: 'Refresh Backup List',
            cls: 'mod-cta'
        });
        refreshButton.style.marginBottom = '1em';
        refreshButton.onclick = () => {
            // Re-render needs to be handled by the main settings tab
        };

        // Get all files with backups
        const backupFiles = await backupManager.getAllBackupFiles();

        if (backupFiles.length === 0) {
            containerEl.createEl('div', {
                text: 'No backups found.',
                cls: 'setting-item-description'
            });
            return;
        }

        // Create backup list
        for (const filePath of backupFiles) {
            const backups = await backupManager.getBackupsForFile(filePath);

            if (backups.length === 0) continue;

            // File header
            const fileSection = containerEl.createDiv({ cls: 'backup-file-section' });
            fileSection.createEl('h4', { text: filePath, cls: 'backup-file-path' });

            // Backups for this file
            const backupList = fileSection.createDiv({ cls: 'backup-list' });

            backups.forEach((backup, index) => {
                const backupItem = backupList.createDiv({ cls: 'backup-item' });

                // Backup info
                const backupInfo = backupItem.createDiv({ cls: 'backup-info' });
                const sizeKB = backup.fileSize ? Math.round(backup.fileSize / 1024) : 0;
                const fileType = backup.isBinary ? 'Binary' : 'Text';
                backupInfo.createEl('span', {
                    text: `${backup.readableTimestamp} (${sizeKB} KB, ${fileType})`,
                    cls: 'backup-timestamp'
                });

                // Backup actions
                const backupActions = backupItem.createDiv({ cls: 'backup-actions' });

                // Restore button
                const restoreBtn = backupActions.createEl('button', {
                    text: 'Restore',
                    cls: 'mod-cta'
                });
                restoreBtn.onclick = async () => {
                    const confirmed = await DialogHelpers.showConfirmationDialog( // Use DialogHelpers
                        'Restore Backup',
                        `Are you sure you want to restore the backup from ${backup.readableTimestamp}? This will overwrite the current file content.`
                    );

                    if (confirmed) {
                        try {
                            const result = await backupManager.restoreBackup(backup);
                            if (result.success) {
                                new Notice(`Successfully restored backup for ${filePath}`);
                            } else {
                                new Notice(`Failed to restore backup: ${result.error}`);
                            }
                        } catch (error) {
                            new Notice(`Error restoring backup: ${error.message}`);
                        }
                    }
                };

                // Delete button
                const deleteBtn = backupActions.createEl('button', {
                    text: 'Delete',
                    cls: 'mod-warning'
                });
                deleteBtn.onclick = async () => {
                    const confirmed = await DialogHelpers.showConfirmationDialog( // Use DialogHelpers
                        'Delete Backup',
                        `Are you sure you want to delete the backup from ${backup.readableTimestamp}?`
                    );

                    if (confirmed) {
                        try {
                            await backupManager.deleteSpecificBackup(filePath, backup.timestamp);
                            new Notice(`Deleted backup for ${filePath}`);
                            // Re-render needs to be handled by the main settings tab
                        } catch (error) {
                            new Notice(`Error deleting backup: ${error.message}`);
                        }
                    }
                };

                // Preview button (show first 200 characters for text files only)
                if (!backup.isBinary && backup.content) {
                    const previewBtn = backupActions.createEl('button', {
                        text: 'Preview',
                        cls: 'mod-muted'
                    });
                    previewBtn.onclick = () => {
                        const preview = backup.content!.substring(0, 200);
                        const truncated = backup.content!.length > 200 ? '...' : '';
                        new Notice(`Preview: ${preview}${truncated}`, 10000);
                    };
                } else if (backup.isBinary) {
                    const infoBtn = backupActions.createEl('button', {
                        text: 'File Info',
                        cls: 'mod-muted'
                    });
                    infoBtn.onclick = () => {
                        const sizeKB = backup.fileSize ? Math.round(backup.fileSize / 1024) : 0;
                        new Notice(`Binary file backup: ${sizeKB} KB\nStored at: ${backup.backupFilePath || 'Unknown location'}`, 5000);
                    };
                }
            });

            // Delete all backups for this file
            const deleteAllBtn = fileSection.createEl('button', {
                text: `Delete All Backups for ${filePath}`,
                cls: 'mod-warning'
            });
            deleteAllBtn.onclick = async () => {
                const confirmed = await DialogHelpers.showConfirmationDialog( // Use DialogHelpers
                    'Delete All Backups',
                    `Are you sure you want to delete all ${backups.length} backups for ${filePath}?`
                );

                if (confirmed) {
                    try {
                        await backupManager.deleteBackupsForFile(filePath);
                        new Notice(`Deleted all backups for ${filePath}`);
                        // Re-render needs to be handled by the main settings tab
                    } catch (error) {
                        new Notice(`Error deleting backups: ${error.message}`);
                    }
                }
            };
        }
    }

    /**
     * Renders the Trash Management section.
     * @param containerEl The HTML element to append the section to.
     */
    private async renderTrashManagement(containerEl: HTMLElement): Promise<void> {
        // Add some spacing between sections
        containerEl.createEl('div', { attr: { style: 'margin-top: 2em; border-top: 1px solid var(--background-modifier-border); padding-top: 1em;' } });
        
        containerEl.createEl('h3', { text: 'Trash Management' });
        containerEl.createEl('div', {
            text: 'Manage files and folders moved to the .trash folder. Files in trash can be restored or permanently deleted.',
            cls: 'setting-item-description',
            attr: { style: 'margin-bottom: 1em;' }
        });

        const trashPath = '.trash';
        const trashFolder = this.plugin.app.vault.getAbstractFileByPath(trashPath);

        if (!trashFolder) {
            containerEl.createEl('div', {
                text: 'No trash folder found. Trash folder will be created automatically when files are deleted with soft delete.',
                cls: 'setting-item-description'
            });
            return;
        }

        if (!(trashFolder instanceof TFolder)) {
            containerEl.createEl('div', {
                text: 'Error: .trash exists but is not a folder.',
                cls: 'setting-item-description'
            });
            return;
        }

        // Count items in trash
        const trashItems = (trashFolder as TFolder).children || [];
        const fileCount = trashItems.filter((item) => item instanceof TFile).length;
        const folderCount = trashItems.filter((item) => item instanceof TFolder).length;

        containerEl.createEl('div', {
            text: `Trash contains: ${fileCount} files, ${folderCount} folders`,
            cls: 'setting-item-description',
            attr: { style: 'margin-bottom: 1em; font-weight: bold;' }
        });

        // Add action buttons
        const actionsContainer = containerEl.createDiv({ attr: { style: 'margin-bottom: 1em;' } });

        // Refresh button
        const refreshBtn = actionsContainer.createEl('button', {
            text: 'Refresh Trash',
            cls: 'mod-cta'
        });
        refreshBtn.style.marginRight = '0.5em';
        refreshBtn.onclick = () => {
            // Re-render needs to be handled by the main settings tab
        };

        // Empty trash button
        if (trashItems.length > 0) {
            const emptyTrashBtn = actionsContainer.createEl('button', {
                text: 'Empty Trash',
                cls: 'mod-warning'
            });
            emptyTrashBtn.style.marginRight = '0.5em';
            emptyTrashBtn.onclick = async () => {
                const confirmed = await DialogHelpers.showConfirmationDialog(
                    'Empty Trash',
                    `Are you sure you want to permanently delete all ${trashItems.length} items in trash? This cannot be undone.`
                );

                if (confirmed) {
                    try {
                        // Delete all items in trash
                        for (const item of trashItems) {
                            await this.plugin.app.vault.delete(item);
                        }
                        new Notice(`Emptied trash - permanently deleted ${trashItems.length} items`);
                        // Re-render needs to be handled by the main settings tab
                    } catch (error) {
                        new Notice(`Error emptying trash: ${error.message}`);
                    }
                }
            };
        }

        // Show trash items
        if (trashItems.length === 0) {
            containerEl.createEl('div', {
                text: 'Trash is empty.',
                cls: 'setting-item-description'
            });
            return;
        }

        // Create trash item list
        const trashList = containerEl.createDiv({ cls: 'trash-list' });

        for (const item of trashItems.slice(0, 20)) { // Limit to first 20 items
            const trashItem = trashList.createDiv({ cls: 'trash-item', attr: { style: 'margin-bottom: 0.5em; padding: 0.5em; border: 1px solid var(--background-modifier-border); border-radius: 4px;' } });

            // Item info
            const itemInfo = trashItem.createDiv({ cls: 'trash-item-info' });
            const isFolder = item instanceof TFolder;
            const icon = isFolder ? '📁' : '📄';
            const size = !isFolder && item instanceof TFile && item.stat ? ` (${Math.round(item.stat.size / 1024)} KB)` : '';
            
            itemInfo.createEl('span', {
                text: `${icon} ${item.name}${size}`,
                cls: 'trash-item-name'
            });

            // Item actions
            const itemActions = trashItem.createDiv({ cls: 'trash-item-actions', attr: { style: 'margin-top: 0.5em;' } });

            // Restore button
            const restoreBtn = itemActions.createEl('button', {
                text: 'Restore',
                cls: 'mod-cta'
            });
            restoreBtn.style.marginRight = '0.5em';
            restoreBtn.onclick = async () => {
                const confirmed = await DialogHelpers.showConfirmationDialog(
                    'Restore Item',
                    `Restore "${item.name}" to vault root? If an item with the same name exists, it will be overwritten.`
                );

                if (confirmed) {
                    try {
                        // Move back to vault root
                        const newPath = item.name;
                        await this.plugin.app.fileManager.renameFile(item, newPath);
                        new Notice(`Restored "${item.name}" to vault root`);
                        // Re-render needs to be handled by the main settings tab
                    } catch (error) {
                        new Notice(`Error restoring item: ${error.message}`);
                    }
                }
            };

            // Delete permanently button
            const deleteBtn = itemActions.createEl('button', {
                text: 'Delete Permanently',
                cls: 'mod-warning'
            });
            deleteBtn.onclick = async () => {
                const confirmed = await DialogHelpers.showConfirmationDialog(
                    'Delete Permanently',
                    `Permanently delete "${item.name}"? This cannot be undone.`
                );

                if (confirmed) {
                    try {
                        await this.plugin.app.vault.delete(item);
                        new Notice(`Permanently deleted "${item.name}"`);
                        // Re-render needs to be handled by the main settings tab
                    } catch (error) {
                        new Notice(`Error deleting item: ${error.message}`);
                    }
                }
            };
        }

        if (trashItems.length > 20) {
            containerEl.createEl('div', {
                text: `... and ${trashItems.length - 20} more items. Empty trash to remove all items.`,
                cls: 'setting-item-description',
                attr: { style: 'margin-top: 1em; font-style: italic;' }
            });
        }
    }
}
