import { App, PluginSettingTab, Setting, Notice, TFolder, TFile } from 'obsidian';
import MyPlugin from '../../main';
import { SettingCreators } from '../components/SettingCreators';
import { CollapsibleSectionRenderer } from '../../utils/CollapsibleSection';
import { DialogHelpers } from '../components/DialogHelpers';
import { FileBackup } from '../../types/backup';
import { isTFile } from '../../utils/typeGuards';

/**
 * BackupManagementSection is responsible for rendering settings related to file backups and trash management.
 * It allows users to view, restore, and delete file backups created by AI tools, and manage items in the .trash folder.
 */
export class BackupManagementSection {
    private plugin: MyPlugin;
    private settingCreators: SettingCreators;

    constructor(plugin: MyPlugin, settingCreators: SettingCreators) {
        this.plugin = plugin;
        this.settingCreators = settingCreators;
    }

    /**
     * Render both Backup and Trash Management sections
     */
    async render(containerEl: HTMLElement): Promise<void> {
        await this.renderBackupManagement(containerEl);
        await this.renderTrashManagement(containerEl);
    }

    /**
     * Render the Backup Management section
     */
    private async renderBackupManagement(containerEl: HTMLElement): Promise<void> {
        this.renderSectionHeader(containerEl, 'Backup Management',
            'Manage backups created when files are modified by AI tools. Backups are stored in the plugin data folder, not in your vault.',
            async (sectionEl: HTMLElement) => {
                const backupManager = this.plugin.backupManager;
                const [totalBackups, totalSize, backupFiles] = await Promise.all([
                    backupManager.getTotalBackupCount(),
                    backupManager.getTotalBackupSize(),
                    backupManager.getAllBackupFiles()
                ]);
                const sizeInKB = Math.round(totalSize / 1024);
                sectionEl.createEl('div', {
                    text: `Total backups: ${totalBackups} (${sizeInKB} KB)`,
                    cls: 'setting-item-description',
                    attr: { style: 'margin-bottom: 1em; font-weight: bold;' }
                });

                this.renderBackupActions(sectionEl, backupFiles.length > 0, async () => {
                    await this.renderBackupManagement(containerEl);
                }, async () => {
                    const confirmed = await DialogHelpers.showConfirmationDialog(
                        'Delete All Backups',
                        `Are you sure you want to delete ALL ${totalBackups} backups for ALL files? This action cannot be undone and will permanently remove all backup data.`
                    );
                    if (confirmed) {
                        try {
                            await backupManager.deleteAllBackups();
                            new Notice('Deleted all backups successfully');
                            await this.renderBackupManagement(containerEl);
                        } catch (error) {
                            new Notice(`Error deleting all backups: ${error.message}`);
                        }
                    }
                });

                if (backupFiles.length === 0) {
                    sectionEl.createEl('div', {
                text: 'No backups found.',
                cls: 'setting-item-description'
            });
            return;
        }

        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Backup Files List',
            (backupListEl: HTMLElement) => {
                this.renderBackupFilesList(backupListEl, backupFiles, backupManager);
            },
            this.plugin,
            'backupManagementExpanded'
        );
            });
    }

    /**
     * Render header and description for a section using CollapsibleSectionRenderer
     */
    private renderSectionHeader(
        containerEl: HTMLElement,
        title: string,
        description: string,
        contentCallback: (sectionEl: HTMLElement) => void | Promise<void>
    ): void {
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            title,
            (sectionEl: HTMLElement) => {
                sectionEl.createEl('div', {
                    text: description,
                    cls: 'setting-item-description',
                    attr: { style: 'margin-bottom: 1em;' }
                });
                const result = contentCallback(sectionEl);
                if (result instanceof Promise) {
                    result.catch(error => console.error('Error in collapsible section:', error));
                }
            },
            this.plugin,
            'generalSectionsExpanded'
        );
    }

    /**
     * Render action buttons for backup management
     */
    private renderBackupActions(
        containerEl: HTMLElement,
        hasBackups: boolean,
        onRefresh: () => void,
        onDeleteAll: () => void
    ): void {
        const actionsContainer = containerEl.createDiv({ attr: { style: 'margin-bottom: 1em;' } });
        const refreshButton = actionsContainer.createEl('button', {
            text: 'Refresh Backup List',
            cls: 'mod-cta'
        });
        refreshButton.style.marginRight = '0.5em';
        refreshButton.onclick = onRefresh;
        if (hasBackups) {
            const deleteAllBtn = actionsContainer.createEl('button', {
                text: 'Delete All Backups',
                cls: 'mod-warning'
            });
            deleteAllBtn.onclick = onDeleteAll;
        }
    }

    /**
     * Render the list of backup files and their actions
     */
    private async renderBackupFilesList(containerEl: HTMLElement, backupFiles: string[], backupManager: any): Promise<void> {
        for (const filePath of backupFiles) {
            const backups = await backupManager.getBackupsForFile(filePath);
            if (backups.length === 0) continue;
            const fileSection = containerEl.createDiv({ cls: 'backup-file-section' });
            fileSection.createEl('h4', { text: filePath, cls: 'backup-file-path' });
            const backupList = fileSection.createDiv({ cls: 'backup-list' });
            backups.forEach((backup: FileBackup) => {
                const backupItem = backupList.createDiv({ cls: 'backup-item' });
                const backupInfo = backupItem.createDiv({ cls: 'backup-info' });
                const sizeKB = backup.fileSize ? Math.round(backup.fileSize / 1024) : 0;
                const fileType = backup.isBinary ? 'Binary' : 'Text';
                backupInfo.createEl('span', {
                    text: `${backup.readableTimestamp} (${sizeKB} KB, ${fileType})`,
                    cls: 'backup-timestamp'
                });
                const backupActions = backupItem.createDiv({ cls: 'backup-actions' });
                this.renderBackupActionButtons(backupActions, backup, filePath, backupManager, containerEl, backupFiles);
            });
            this.renderDeleteAllBackupsForFileButton(fileSection, filePath, backups.length, backupManager, containerEl, backupFiles);
        }
    }

    /**
     * Render action buttons for each backup
     */
    private renderBackupActionButtons(
        backupActions: HTMLElement,
        backup: FileBackup,
        filePath: string,
        backupManager: any,
        containerEl: HTMLElement,
        backupFiles: string[]
    ) {
        // Restore
        const restoreBtn = backupActions.createEl('button', {
            text: 'Restore',
            cls: 'mod-cta'
        });
        restoreBtn.onclick = async () => {
            const confirmed = await DialogHelpers.showConfirmationDialog(
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
        // Delete
        const deleteBtn = backupActions.createEl('button', {
            text: 'Delete',
            cls: 'mod-warning'
        });
        deleteBtn.onclick = async () => {
            const confirmed = await DialogHelpers.showConfirmationDialog(
                'Delete Backup',
                `Are you sure you want to delete the backup from ${backup.readableTimestamp}?`
            );
            if (confirmed) {
                try {
                    await backupManager.deleteSpecificBackup(filePath, backup.timestamp);
                    new Notice(`Deleted backup for ${filePath}`);
                    containerEl.empty();
                    await this.renderBackupFilesList(containerEl, backupFiles, backupManager);
                } catch (error) {
                    new Notice(`Error deleting backup: ${error.message}`);
                }
            }
        };
        // Preview or Info
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
    }

    /**
     * Render delete all backups for a file button
     */
    private renderDeleteAllBackupsForFileButton(
        fileSection: HTMLElement,
        filePath: string,
        backupCount: number,
        backupManager: any,
        containerEl: HTMLElement,
        backupFiles: string[]
    ) {
        const deleteAllBtn = fileSection.createEl('button', {
            text: `Delete All Backups for ${filePath}`,
            cls: 'mod-warning'
        });
        deleteAllBtn.onclick = async () => {
            const confirmed = await DialogHelpers.showConfirmationDialog(
                'Delete All Backups',
                `Are you sure you want to delete all ${backupCount} backups for ${filePath}?`
            );
            if (confirmed) {
                try {
                    await backupManager.deleteBackupsForFile(filePath);
                    new Notice(`Deleted all backups for ${filePath}`);
                    containerEl.empty();
                    await this.renderBackupFilesList(containerEl, backupFiles, backupManager);
                } catch (error) {
                    new Notice(`Error deleting backups: ${error.message}`);
                }
            }
        };
    }

    /**
     * Render the Trash Management section
     */
    private async renderTrashManagement(containerEl: HTMLElement): Promise<void> {
        // Section header
        containerEl.createEl('div', { attr: { style: 'margin-top: 2em; border-top: 1px solid var(--background-modifier-border); padding-top: 1em;' } });
        this.renderSectionHeader(containerEl, 'Trash Management',
            'Manage files and folders moved to the .trash folder. Files in trash can be restored or permanently deleted.',
            async (sectionEl: HTMLElement) => {
                const trashPath = '.trash';
                let trashFolder = this.plugin.app.vault.getAbstractFileByPath(trashPath);
                let trashItems: { name: string, isFolder: boolean, size?: number }[] = [];
                let fallbackUsed = false;

                // Try to get trash items
                if (!trashFolder) {
                    fallbackUsed = true;
                    try {
                        const adapter = this.plugin.app.vault.adapter;
                        if (await adapter.exists(trashPath)) {
                            const files = await adapter.list(trashPath);
                            trashItems = [
                                ...files.files.map(f => ({ name: f.substring(f.lastIndexOf('/') + 1), isFolder: false })),
                                ...files.folders.map(f => ({ name: f.substring(f.lastIndexOf('/') + 1), isFolder: true }))
                            ];
                        } else {
                            sectionEl.createEl('div', {
                                text: 'No trash folder found. Trash folder will be created automatically when files are deleted with soft delete.',
                                cls: 'setting-item-description'
                            });
                            return;
                        }
                    } catch (e) {
                        sectionEl.createEl('div', {
                            text: 'Error reading trash folder from file system.',
                            cls: 'setting-item-description'
                        });
                        return;
                    }
                } else if (trashFolder instanceof TFolder) {
                    trashItems = (trashFolder as TFolder).children.map(item => ({
                        name: item.name,
                        isFolder: item instanceof TFolder,
                        size: (isTFile(item) && item.stat) ? item.stat.size : undefined
                    }));
                } else {
                    sectionEl.createEl('div', {
                        text: 'Error: .trash exists but is not a folder.',
                        cls: 'setting-item-description'
                    });
                    return;
                }

                // Trash summary
                const fileCount = trashItems.filter((item) => !item.isFolder).length;
                const folderCount = trashItems.filter((item) => item.isFolder).length;
                sectionEl.createEl('div', {
                    text: `Trash contains: ${fileCount} files, ${folderCount} folders${fallbackUsed ? ' (filesystem fallback)' : ''}`,
                    cls: 'setting-item-description',
                    attr: { style: 'margin-bottom: 1em; font-weight: bold;' }
                });

                this.renderTrashActions(sectionEl, trashItems.length > 0, async () => {
                    await this.renderTrashManagement(containerEl);
                }, async () => {
                    const confirmed = await DialogHelpers.showConfirmationDialog(
                        'Empty Trash',
                        `Are you sure you want to permanently delete all ${trashItems.length} items in trash? This cannot be undone.`
                    );
                    if (confirmed) {
                        try {
                            const adapter = this.plugin.app.vault.adapter;
                            for (const item of trashItems) {
                                const fullPath = `${trashPath}/${item.name}`;
                                if (item.isFolder) {
                                    await adapter.rmdir(fullPath, true);
                                } else {
                                    await adapter.remove(fullPath);
                                }
                            }
                            new Notice(`Emptied trash - permanently deleted ${trashItems.length} items`);
                            await this.renderTrashManagement(containerEl);
                        } catch (error) {
                            new Notice(`Error emptying trash: ${error.message}`);
                        }
                    }
                });

                if (trashItems.length === 0) {
                    sectionEl.createEl('div', {
                        text: 'Trash is empty.',
                        cls: 'setting-item-description'
                    });
                    return;
                }

                this.renderTrashList(sectionEl, trashItems, fallbackUsed);
            }
        );
    }

    /**
     * Render action buttons for trash management
     */
    private renderTrashActions(containerEl: HTMLElement, hasTrash: boolean, onRefresh: () => void, onEmpty: () => void) {
        const actionsContainer = containerEl.createDiv({ attr: { style: 'margin-bottom: 1em;' } });
        const refreshBtn = actionsContainer.createEl('button', {
            text: 'Refresh Trash',
            cls: 'mod-cta'
        });
        refreshBtn.style.marginRight = '0.5em';
        refreshBtn.onclick = onRefresh;
        if (hasTrash) {
            const emptyTrashBtn = actionsContainer.createEl('button', {
                text: 'Empty Trash',
                cls: 'mod-warning'
            });
            emptyTrashBtn.style.marginRight = '0.5em';
            emptyTrashBtn.onclick = onEmpty;
        }
    }

    /**
     * Render the list of trash items and their actions
     */
    private renderTrashList(containerEl: HTMLElement, trashItems: { name: string, isFolder: boolean, size?: number }[], fallbackUsed: boolean) {
        const trashList = containerEl.createDiv({ cls: 'trash-list' });
        const maxItems = 20;
        for (const item of trashItems.slice(0, maxItems)) {
            const trashItem = trashList.createDiv({ cls: 'trash-item', attr: { style: 'margin-bottom: 0.5em; padding: 0.5em; border: 1px solid var(--background-modifier-border); border-radius: 4px;' } });
            const itemInfo = trashItem.createDiv({ cls: 'trash-item-info' });
            const icon = item.isFolder ? '📁' : '📄';
            const size = !item.isFolder && item.size ? ` (${Math.round(item.size / 1024)} KB)` : '';
            itemInfo.createEl('span', {
                text: `${icon} ${item.name}${size}`,
                cls: 'trash-item-name'
            });
            const itemActions = trashItem.createDiv({ cls: 'trash-item-actions', attr: { style: 'margin-top: 0.5em;' } });
            if (!fallbackUsed) {
                this.renderRestoreTrashButton(itemActions, item.name, item.isFolder, containerEl);
            }
            this.renderDeleteTrashButton(itemActions, item.name, item.isFolder, containerEl);
        }
        if (trashItems.length > maxItems) {
            containerEl.createEl('div', {
                text: `... and ${trashItems.length - maxItems} more items. Empty trash to remove all items.`,
                cls: 'setting-item-description',
                attr: { style: 'margin-top: 1em; font-style: italic;' }
            });
        }
    }

    /**
     * Render restore button for trash item
     */
    private renderRestoreTrashButton(itemActions: HTMLElement, name: string, isFolder: boolean, containerEl: HTMLElement) {
        const restoreBtn = itemActions.createEl('button', {
            text: 'Restore',
            cls: 'mod-cta'
        });
        restoreBtn.style.marginRight = '0.5em';
        restoreBtn.onclick = async () => {
            const confirmed = await DialogHelpers.showConfirmationDialog(
                'Restore Item',
                `Restore "${name}" to vault root? If an item with the same name exists, it will be overwritten.`
            );
            if (confirmed) {
                try {
                    const trashFolderObj = this.plugin.app.vault.getAbstractFileByPath('.trash');
                    if (trashFolderObj instanceof TFolder) {
                        const fileObj = (trashFolderObj as TFolder).children.find((child: any) => child.name === name);
                        if (fileObj) {
                            const newPath = name;
                            await this.plugin.app.fileManager.renameFile(fileObj, newPath);
                            new Notice(`Restored "${name}" to vault root`);
                            await this.renderTrashManagement(containerEl.parentElement!);
                        }
                    }
                } catch (error) {
                    new Notice(`Error restoring item: ${error.message}`);
                }
            }
        };
    }

    /**
     * Render delete button for trash item
     */
    private renderDeleteTrashButton(itemActions: HTMLElement, name: string, isFolder: boolean, containerEl: HTMLElement) {
        const deleteBtn = itemActions.createEl('button', {
            text: 'Delete Permanently',
            cls: 'mod-warning'
        });
        deleteBtn.onclick = async () => {
            const confirmed = await DialogHelpers.showConfirmationDialog(
                'Delete Permanently',
                `Permanently delete "${name}"? This cannot be undone.`
            );
            if (confirmed) {
                try {
                    const adapter = this.plugin.app.vault.adapter;
                    const fullPath = `.trash/${name}`;
                    if (isFolder) {
                        await adapter.rmdir(fullPath, true);
                    } else {
                        await adapter.remove(fullPath);
                    }
                    new Notice(`Permanently deleted "${name}"`);
                    await this.renderTrashManagement(containerEl.parentElement!);
                } catch (error) {
                    new Notice(`Error deleting item: ${error.message}`);
                }
            }
        };
    }
}
