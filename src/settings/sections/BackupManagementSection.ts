import { App, Setting, Notice } from 'obsidian';
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
}
