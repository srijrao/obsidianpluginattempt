import { App, PluginSettingTab, Setting, Notice, TFolder, TFile } from 'obsidian';
import MyPlugin from '../../main';
import { SettingCreators } from '../components/SettingCreators';
import { CollapsibleSectionRenderer } from '../../components/chat/CollapsibleSection';
import { DialogHelpers } from '../components/DialogHelpers';
import { FileBackup } from '../../types/backup';
import { isTFile } from '../../utils/typeguards';

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

        
        const totalBackups = await backupManager.getTotalBackupCount();
        const totalSize = await backupManager.getTotalBackupSize();
        const sizeInKB = Math.round(totalSize / 1024);
        containerEl.createEl('div', {
            text: `Total backups: ${totalBackups} (${sizeInKB} KB)`,
            cls: 'setting-item-description',
            attr: { style: 'margin-bottom: 1em; font-weight: bold;' }
        });

        
        const actionsContainer = containerEl.createDiv({ attr: { style: 'margin-bottom: 1em;' } });

        
        const refreshButton = actionsContainer.createEl('button', {
            text: 'Refresh Backup List',
            cls: 'mod-cta'
        });
        refreshButton.style.marginRight = '0.5em';
        refreshButton.onclick = () => {
            
            this.renderBackupManagement(containerEl.parentElement!);
        };

        
        const backupFiles = await backupManager.getAllBackupFiles();

        
        if (backupFiles.length > 0) {
            const deleteAllBtn = actionsContainer.createEl('button', {
                text: 'Delete All Backups',
                cls: 'mod-warning'
            });
            deleteAllBtn.onclick = async () => {
                const totalBackups = await backupManager.getTotalBackupCount();
                const confirmed = await DialogHelpers.showConfirmationDialog(
                    'Delete All Backups',
                    `Are you sure you want to delete ALL ${totalBackups} backups for ALL files? This action cannot be undone and will permanently remove all backup data.`
                );

                if (confirmed) {
                    try {
                        await backupManager.deleteAllBackups();
                        new Notice('Deleted all backups successfully');
                        
                        this.renderBackupManagement(containerEl.parentElement!);
                    } catch (error) {
                        new Notice(`Error deleting all backups: ${error.message}`);
                    }
                }
            };
        }

        if (backupFiles.length === 0) {
            containerEl.createEl('div', {
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
    }

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
                            
                        } catch (error) {
                            new Notice(`Error deleting backup: ${error.message}`);
                        }
                    }
                };

                
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

            
            const deleteAllBtn = fileSection.createEl('button', {
                text: `Delete All Backups for ${filePath}`,
                cls: 'mod-warning'
            });
            deleteAllBtn.onclick = async () => {
                const confirmed = await DialogHelpers.showConfirmationDialog( 
                    'Delete All Backups',
                    `Are you sure you want to delete all ${backups.length} backups for ${filePath}?`
                );

                if (confirmed) {
                    try {
                        await backupManager.deleteBackupsForFile(filePath);
                        new Notice(`Deleted all backups for ${filePath}`);
                        
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
        
        containerEl.createEl('div', { attr: { style: 'margin-top: 2em; border-top: 1px solid var(--background-modifier-border); padding-top: 1em;' } });
        
        containerEl.createEl('h3', { text: 'Trash Management' });
        containerEl.createEl('div', {
            text: 'Manage files and folders moved to the .trash folder. Files in trash can be restored or permanently deleted.',
            cls: 'setting-item-description',
            attr: { style: 'margin-bottom: 1em;' }
        });

        const trashPath = '.trash';
        let trashFolder = this.plugin.app.vault.getAbstractFileByPath(trashPath);

        
        
        console.log('[AI Assistant Debug] .trash lookup:', trashFolder, 'Type:', trashFolder?.constructor?.name);

        let trashItems: { name: string, isFolder: boolean, size?: number }[] = [];
        let fallbackUsed = false;

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
                    containerEl.createEl('div', {
                        text: 'No trash folder found. Trash folder will be created automatically when files are deleted with soft delete.',
                        cls: 'setting-item-description'
                    });
                    return;
                }
            } catch (e) {
                containerEl.createEl('div', {
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
            containerEl.createEl('div', {
                text: 'Error: .trash exists but is not a folder.',
                cls: 'setting-item-description'
            });
            return;
        }

        
        const fileCount = trashItems.filter((item) => !item.isFolder).length;
        const folderCount = trashItems.filter((item) => item.isFolder).length;

        containerEl.createEl('div', {
            text: `Trash contains: ${fileCount} files, ${folderCount} folders${fallbackUsed ? ' (filesystem fallback)' : ''}`,
            cls: 'setting-item-description',
            attr: { style: 'margin-bottom: 1em; font-weight: bold;' }
        });

        
        const actionsContainer = containerEl.createDiv({ attr: { style: 'margin-bottom: 1em;' } });

        
        const refreshBtn = actionsContainer.createEl('button', {
            text: 'Refresh Trash',
            cls: 'mod-cta'
        });
        refreshBtn.style.marginRight = '0.5em';
        refreshBtn.onclick = () => {
            this.renderTrashManagement(containerEl.parentElement!);
        };

        
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
                        this.renderTrashManagement(containerEl.parentElement!);
                    } catch (error) {
                        new Notice(`Error emptying trash: ${error.message}`);
                    }
                }
            };
        }

        
        if (trashItems.length === 0) {
            containerEl.createEl('div', {
                text: 'Trash is empty.',
                cls: 'setting-item-description'
            });
            return;
        }

        
        const trashList = containerEl.createDiv({ cls: 'trash-list' });

        for (const item of trashItems.slice(0, 20)) { 
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
                            
                            const trashFolderObj = this.plugin.app.vault.getAbstractFileByPath(trashPath);
                            if (trashFolderObj instanceof TFolder) {
                                const fileObj = (trashFolderObj as TFolder).children.find((child: any) => child.name === item.name);
                                if (fileObj) {
                                    const newPath = item.name;
                                    await this.plugin.app.fileManager.renameFile(fileObj, newPath);
                                    new Notice(`Restored "${item.name}" to vault root`);
                                    this.renderTrashManagement(containerEl.parentElement!);
                                }
                            }
                        } catch (error) {
                            new Notice(`Error restoring item: ${error.message}`);
                        }
                    }
                };
            }

            
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
                        const adapter = this.plugin.app.vault.adapter;
                        const fullPath = `${trashPath}/${item.name}`;
                        if (item.isFolder) {
                            await adapter.rmdir(fullPath, true);
                        } else {
                            await adapter.remove(fullPath);
                        }
                        new Notice(`Permanently deleted "${item.name}"`);
                        this.renderTrashManagement(containerEl.parentElement!);
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
