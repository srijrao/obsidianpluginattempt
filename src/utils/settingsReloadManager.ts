import { App } from 'obsidian';
import { FSWatcher, watch as fsWatch } from 'fs';
import { promises as fsPromises } from 'fs';
import { debugLog } from './logger';
import { debounce } from './generalUtils';
import { withErrorHandling } from './errorHandler';

export interface SettingsReloadManagerOptions {
    pollInterval?: number;
    debounceDelay?: number;
    debugMode?: boolean;
    onReload: () => Promise<void>;
}

type ReloadTrigger = 'watcher' | 'poll' | 'manual';

type NodeJSError = NodeJS.ErrnoException & { code?: string };

/**
 * Watches the plugin settings file for external changes and triggers reloads.
 */
export class SettingsReloadManager {
    private readonly app: App;
    private readonly dataFilePath: string;
    private readonly options: Required<Omit<SettingsReloadManagerOptions, 'onReload'>> & { onReload: () => Promise<void> };
    private watcher: FSWatcher | null = null;
    private pollTimer: NodeJS.Timeout | null = null;
    private watcherRestartTimer: NodeJS.Timeout | null = null;
    private debouncedReload: (trigger: ReloadTrigger) => void;
    private isReloading = false;
    private reloadQueuedWhileRunning = false;
    private queuedTrigger: ReloadTrigger | null = null;
    private lastKnownModified: number | null = null;
    private pendingModified: number | null = null;
    private isRunning = false;
    private fileMissingLogged = false;

    constructor(app: App, dataFilePath: string, options: SettingsReloadManagerOptions) {
        if (!options?.onReload) {
            throw new Error('SettingsReloadManager requires an onReload callback');
        }

        this.app = app;
        this.dataFilePath = dataFilePath;
        this.options = {
            pollInterval: options.pollInterval ?? 5000,
            debounceDelay: options.debounceDelay ?? 750,
            debugMode: options.debugMode ?? false,
            onReload: options.onReload
        };

        // Debounce reloads to avoid thrashing when multiple events fire in quick succession.
        this.debouncedReload = debounce(async (trigger: ReloadTrigger) => {
            await this.executeReload(trigger);
        }, this.options.debounceDelay);
    }

    /**
     * Start watching the settings file for changes.
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            return;
        }

        this.isRunning = true;

        await this.refreshLastModified();
        this.initializeWatcher();
        this.initializePolling();

        debugLog(this.options.debugMode, 'info', '[SettingsReloadManager] Started watching settings file', {
            path: this.dataFilePath,
            pollInterval: this.options.pollInterval,
            debounceDelay: this.options.debounceDelay
        });
    }

    /**
     * Stop watching the file and clean up timers.
     */
    stop(): void {
        if (!this.isRunning) {
            return;
        }

        this.isRunning = false;

        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }

        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }

        if (this.watcherRestartTimer) {
            clearTimeout(this.watcherRestartTimer);
            this.watcherRestartTimer = null;
        }

        debugLog(this.options.debugMode, 'info', '[SettingsReloadManager] Stopped watching settings file');
    }

    /**
     * Force an immediate reload of settings.
     */
    async reloadNow(): Promise<void> {
        debugLog(this.options.debugMode, 'info', '[SettingsReloadManager] Manual reload triggered');
        await this.executeReload('manual');
        await this.refreshLastModified();
    }

    private initializeWatcher(): void {
        try {
            this.watcher = fsWatch(this.dataFilePath, { persistent: false }, (eventType) => {
                if (!this.isRunning) {
                    return;
                }

                debugLog(this.options.debugMode, 'debug', '[SettingsReloadManager] fs.watch event', { eventType });
                void this.checkForChanges('watcher');

                if (eventType === 'rename') {
                    this.scheduleWatcherRestart();
                }
            });

            this.watcher.on('error', (error: unknown) => {
                const err = error as NodeJSError;
                debugLog(this.options.debugMode, 'warn', '[SettingsReloadManager] Watcher error, falling back to polling only', {
                    code: err?.code,
                    message: err?.message
                });
                this.restartWatcher();
            });
        } catch (error) {
            const err = error as NodeJSError;
            debugLog(this.options.debugMode, 'warn', '[SettingsReloadManager] Failed to initialize fs.watch, relying on polling', {
                code: err?.code,
                message: err?.message
            });
        }
    }

    private initializePolling(): void {
        if (this.pollTimer) {
            return;
        }

        this.pollTimer = setInterval(() => {
            void this.checkForChanges('poll');
        }, this.options.pollInterval);
    }

    private scheduleWatcherRestart(): void {
        if (this.watcherRestartTimer) {
            return;
        }

        this.watcherRestartTimer = setTimeout(() => {
            this.watcherRestartTimer = null;
            this.restartWatcher();
        }, 1000);
    }

    private restartWatcher(): void {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }

        if (!this.isRunning) {
            return;
        }

        this.initializeWatcher();
    }

    private async checkForChanges(trigger: ReloadTrigger): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        try {
            const stats = await fsPromises.stat(this.dataFilePath);
            const modified = stats.mtimeMs;

            if (this.fileMissingLogged) {
                debugLog(this.options.debugMode, 'info', '[SettingsReloadManager] Settings file reappeared');
                this.fileMissingLogged = false;
            }

            const lastKnown = this.lastKnownModified ?? 0;
            if (this.lastKnownModified === null || modified > lastKnown + 1) {
                debugLog(this.options.debugMode, 'debug', '[SettingsReloadManager] Detected potential settings change', {
                    trigger,
                    modified
                });
                this.pendingModified = modified;
                this.debouncedReload(trigger);
            }
        } catch (error) {
            const err = error as NodeJSError;
            if (err?.code === 'ENOENT') {
                if (!this.fileMissingLogged) {
                    debugLog(this.options.debugMode, 'warn', '[SettingsReloadManager] Settings file missing', {
                        path: this.dataFilePath
                    });
                    this.fileMissingLogged = true;
                }
                this.lastKnownModified = null;
                this.pendingModified = null;
            } else {
                debugLog(this.options.debugMode, 'error', '[SettingsReloadManager] Failed to stat settings file', err);
            }
        }
    }

    private async executeReload(trigger: ReloadTrigger): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        if (this.isReloading) {
            this.reloadQueuedWhileRunning = true;
            this.queuedTrigger = trigger;
            return;
        }

        this.isReloading = true;
        const start = Date.now();

        debugLog(this.options.debugMode, 'info', '[SettingsReloadManager] Reloading settings', { trigger });

        const result = await withErrorHandling(async () => {
            await this.options.onReload();
            return true;
        }, 'SettingsReloadManager', `reload-${trigger}`, {
            showNotice: false
        });

        if (result !== null) {
            if (this.pendingModified !== null) {
                this.lastKnownModified = this.pendingModified;
                this.pendingModified = null;
            } else {
                await this.refreshLastModified();
            }

            debugLog(this.options.debugMode, 'info', '[SettingsReloadManager] Settings reload finished', {
                trigger,
                durationMs: Date.now() - start
            });
        }

        this.isReloading = false;

        if (this.reloadQueuedWhileRunning) {
            this.reloadQueuedWhileRunning = false;
            const followUpTrigger = this.queuedTrigger ?? 'watcher';
            this.queuedTrigger = null;
            this.debouncedReload(followUpTrigger);
        }
    }

    private async refreshLastModified(): Promise<void> {
        try {
            const stats = await fsPromises.stat(this.dataFilePath);
            this.lastKnownModified = stats.mtimeMs;
            this.pendingModified = null;
            if (this.fileMissingLogged) {
                debugLog(this.options.debugMode, 'info', '[SettingsReloadManager] Settings file found after missing state');
                this.fileMissingLogged = false;
            }
        } catch (error) {
            const err = error as NodeJSError;
            if (err?.code === 'ENOENT') {
                this.lastKnownModified = null;
                this.pendingModified = null;
                if (!this.fileMissingLogged) {
                    debugLog(this.options.debugMode, 'warn', '[SettingsReloadManager] Settings file not found during refresh', {
                        path: this.dataFilePath
                    });
                    this.fileMissingLogged = true;
                }
            } else {
                debugLog(this.options.debugMode, 'error', '[SettingsReloadManager] Failed to refresh file metadata', err);
            }
        }
    }
}
