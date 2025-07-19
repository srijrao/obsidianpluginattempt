/**
 * @file obsidian.ts
 * @description Mock implementation of Obsidian API for testing
 */

// Mock Plugin class
export class Plugin {
  app: any;
  manifest: any;
  
  constructor() {
    this.app = {
      vault: {
        adapter: {
          exists: jest.fn().mockResolvedValue(false),
          read: jest.fn().mockResolvedValue('{}'),
          write: jest.fn().mockResolvedValue(undefined),
          remove: jest.fn().mockResolvedValue(undefined),
        }
      }
    };
    this.manifest = {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0'
    };
  }

  async loadData(): Promise<any> {
    return {};
  }

  async saveData(data: any): Promise<void> {
    // Mock implementation
  }

  addCommand(command: any): void {
    // Mock implementation
  }

  addSettingTab(tab: any): void {
    // Mock implementation
  }

  registerEvent(event: any): void {
    // Mock implementation
  }

  async onload(): Promise<void> {
    // Mock implementation
  }

  onunload(): void {
    // Mock implementation
  }
}

// Mock Component class
export class Component {
  _loaded = false;

  load(): void {
    this._loaded = true;
  }

  unload(): void {
    this._loaded = false;
  }

  onload(): void {
    // Mock implementation
  }

  onunload(): void {
    // Mock implementation
  }

  addChild<T extends Component>(component: T): T {
    return component;
  }

  removeChild<T extends Component>(component: T): T {
    return component;
  }

  register(cb: () => any): void {
    // Mock implementation
  }

  registerEvent(eventRef: any): void {
    // Mock implementation
  }
}

// Mock PluginSettingTab class
export class PluginSettingTab extends Component {
  plugin: Plugin;
  app: any;
  containerEl: HTMLElement;

  constructor(app: any, plugin: Plugin) {
    super();
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement('div');
  }

  display(): void {
    // Mock implementation
  }

  hide(): void {
    // Mock implementation
  }
}

// Mock Setting class
export class Setting {
  settingEl: HTMLElement;
  infoEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  controlEl: HTMLElement;

  constructor(containerEl: HTMLElement) {
    this.settingEl = document.createElement('div');
    this.infoEl = document.createElement('div');
    this.nameEl = document.createElement('div');
    this.descEl = document.createElement('div');
    this.controlEl = document.createElement('div');
    containerEl.appendChild(this.settingEl);
  }

  setName(name: string): this {
    this.nameEl.textContent = name;
    return this;
  }

  setDesc(desc: string): this {
    this.descEl.textContent = desc;
    return this;
  }

  addText(cb: (text: any) => any): this {
    const textEl = document.createElement('input');
    textEl.type = 'text';
    this.controlEl.appendChild(textEl);
    
    const textComponent = {
      inputEl: textEl,
      setValue: (value: string) => {
        textEl.value = value;
        return textComponent;
      },
      getValue: () => textEl.value,
      setPlaceholder: (placeholder: string) => {
        textEl.placeholder = placeholder;
        return textComponent;
      },
      onChange: (callback: (value: string) => void) => {
        textEl.addEventListener('input', () => callback(textEl.value));
        return textComponent;
      }
    };
    
    cb(textComponent);
    return this;
  }

  addToggle(cb: (toggle: any) => any): this {
    const toggleEl = document.createElement('input');
    toggleEl.type = 'checkbox';
    this.controlEl.appendChild(toggleEl);
    
    const toggleComponent = {
      toggleEl,
      setValue: (value: boolean) => {
        toggleEl.checked = value;
        return toggleComponent;
      },
      getValue: () => toggleEl.checked,
      onChange: (callback: (value: boolean) => void) => {
        toggleEl.addEventListener('change', () => callback(toggleEl.checked));
        return toggleComponent;
      }
    };
    
    cb(toggleComponent);
    return this;
  }

  addDropdown(cb: (dropdown: any) => any): this {
    const selectEl = document.createElement('select');
    this.controlEl.appendChild(selectEl);
    
    const dropdownComponent = {
      selectEl,
      addOption: (value: string, text: string) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        selectEl.appendChild(option);
        return dropdownComponent;
      },
      setValue: (value: string) => {
        selectEl.value = value;
        return dropdownComponent;
      },
      getValue: () => selectEl.value,
      onChange: (callback: (value: string) => void) => {
        selectEl.addEventListener('change', () => callback(selectEl.value));
        return dropdownComponent;
      }
    };
    
    cb(dropdownComponent);
    return this;
  }

  addButton(cb: (button: any) => any): this {
    const buttonEl = document.createElement('button');
    this.controlEl.appendChild(buttonEl);
    
    const buttonComponent = {
      buttonEl,
      setButtonText: (text: string) => {
        buttonEl.textContent = text;
        return buttonComponent;
      },
      setCta: () => {
        buttonEl.classList.add('mod-cta');
        return buttonComponent;
      },
      setWarning: () => {
        buttonEl.classList.add('mod-warning');
        return buttonComponent;
      },
      onClick: (callback: () => void) => {
        buttonEl.addEventListener('click', callback);
        return buttonComponent;
      }
    };
    
    cb(buttonComponent);
    return this;
  }
}

// Mock Notice class as a Jest mock function
export const Notice = jest.fn().mockImplementation((message: string, timeout?: number) => {
  return {
    message,
    timeout: timeout || 5000,
    hide: jest.fn()
  };
});

// Mock TFile class
export class TFile {
  path: string;
  name: string;
  basename: string;
  extension: string;
  stat: { ctime: number; mtime: number; size: number };

  constructor(path: string) {
    this.path = path;
    this.name = path.split('/').pop() || '';
    this.basename = this.name.split('.')[0];
    this.extension = this.name.split('.').pop() || '';
    this.stat = {
      ctime: Date.now(),
      mtime: Date.now(),
      size: 0
    };
  }
}

// Mock Vault class
export class Vault {
  adapter: any;

  constructor() {
    this.adapter = {
      exists: jest.fn().mockResolvedValue(false),
      read: jest.fn().mockResolvedValue('{}'),
      write: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue({ files: [], folders: [] }),
      mkdir: jest.fn().mockResolvedValue(undefined),
      rmdir: jest.fn().mockResolvedValue(undefined),
    };
  }

  async read(file: TFile | string): Promise<string> {
    return this.adapter.read(typeof file === 'string' ? file : file.path);
  }

  async write(path: string, data: string): Promise<void> {
    return this.adapter.write(path, data);
  }

  async exists(path: string): Promise<boolean> {
    return this.adapter.exists(path);
  }

  async delete(file: TFile | string): Promise<void> {
    return this.adapter.remove(typeof file === 'string' ? file : file.path);
  }
}

// Mock Modal class
export class Modal {
  app: any;
  contentEl: HTMLElement;
  titleEl: HTMLElement;
  modalEl: HTMLElement;

  constructor(app: any) {
    this.app = app;
    this.contentEl = document.createElement('div');
    this.titleEl = document.createElement('div');
    this.modalEl = document.createElement('div');
    this.modalEl.appendChild(this.titleEl);
    this.modalEl.appendChild(this.contentEl);
  }

  open(): void {
    this.onOpen();
  }

  close(): void {
    this.onClose();
  }

  onOpen(): void {
    // Mock implementation - can be overridden
  }

  onClose(): void {
    // Mock implementation - can be overridden
  }
}

// Mock Editor class
export class Editor {
  getValue(): string {
    return '';
  }

  setValue(value: string): void {
    // Mock implementation
  }

  getLine(line: number): string {
    return '';
  }

  setLine(line: number, text: string): void {
    // Mock implementation
  }

  lineCount(): number {
    return 0;
  }

  getCursor(): { line: number; ch: number } {
    return { line: 0, ch: 0 };
  }

  setCursor(line: number, ch?: number): void {
    // Mock implementation
  }

  getSelection(): string {
    return '';
  }

  replaceSelection(replacement: string): void {
    // Mock implementation
  }
}

// Export commonly used types and interfaces
export interface App {
  vault: Vault;
  workspace: any;
  metadataCache: any;
  fileManager: any;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  minAppVersion: string;
  description: string;
  author: string;
  authorUrl?: string;
  fundingUrl?: string;
  isDesktopOnly?: boolean;
}

// Mock debounce function
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate?: boolean
): T {
  let timeout: NodeJS.Timeout | null = null;
  
  return ((...args: any[]) => {
    const later = () => {
      timeout = null;
      if (!immediate) func(...args);
    };
    
    const callNow = immediate && !timeout;
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func(...args);
  }) as T;
}

// Mock normalizePath function
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}