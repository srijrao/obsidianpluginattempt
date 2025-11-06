/**
 * @file obsidian.ts
 * @description Mock implementation of Obsidian API for testing
 */

// Mock Plugin class
export class Plugin {
  app: any;
  manifest: any;

  constructor(app?: any, manifest?: any) {
    this.app = app || {
      vault: {
        adapter: {
          exists: jest.fn().mockResolvedValue(false),
          read: jest.fn().mockResolvedValue('{}'),
          write: jest.fn().mockResolvedValue(undefined),
          remove: jest.fn().mockResolvedValue(undefined),
        }
      }
    };
    this.manifest = manifest || {
      id: 'ai-assistant-for-obsidian',
      name: 'AI Assistant for Obsidian',
      version: '2.1.0'
    };
  }

  async loadData(): Promise<any> {
    return {};
  }

  saveData = jest.fn().mockResolvedValue(undefined);

  addCommand = jest.fn().mockImplementation((command: any) => {
    // Mock implementation
  });

  addSettingTab = jest.fn().mockImplementation((tab: any) => {
    // Mock implementation
  });

  addRibbonIcon = jest.fn().mockImplementation((icon: string, title: string, callback: any) => {
    // Mock implementation
  });

  registerEvent = jest.fn().mockImplementation((event: any) => {
    // Mock implementation
  });

  registerPluginView = jest.fn().mockImplementation((viewType: string, viewCreator: any) => {
    // Mock implementation
  });

  registerMarkdownPostProcessor = jest.fn().mockImplementation((processor: any) => {
    // Mock implementation
  });

  registerMarkdownCodeBlockProcessor = jest.fn().mockImplementation((language: string, processor: any) => {
    // Mock implementation
  });

  register = jest.fn().mockImplementation((callback: () => void) => {
    // Mock register method for cleanup handlers - store callbacks to call during onunload
    if (!(this as any)._cleanupCallbacks) {
      (this as any)._cleanupCallbacks = [];
    }
    (this as any)._cleanupCallbacks.push(callback);
    // Return a function to unregister
    return () => {
      const index = (this as any)._cleanupCallbacks.indexOf(callback);
      if (index > -1) {
        (this as any)._cleanupCallbacks.splice(index, 1);
      }
    };
  });

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
    // Add Obsidian-specific methods
    (this.containerEl as any).empty = jest.fn().mockImplementation(() => {
      while (this.containerEl.firstChild) {
        this.containerEl.removeChild(this.containerEl.firstChild);
      }
    });
    (this.containerEl as any).createEl = jest.fn().mockImplementation((tagName: string, options?: any) => {
      const el = document.createElement(tagName);
      if (options?.text) el.textContent = options.text;
      if (options?.cls) el.className = options.cls;
      this.containerEl.appendChild(el);
      return el;
    });
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
    this.settingEl.className = 'setting-item';
    this.infoEl = document.createElement('div');
    this.infoEl.className = 'setting-item-info';
    this.nameEl = document.createElement('div');
    this.nameEl.className = 'setting-item-name';
    this.descEl = document.createElement('div');
    this.descEl.className = 'setting-item-description';
    this.controlEl = document.createElement('div');
    this.controlEl.className = 'setting-item-control';
    
    this.settingEl.appendChild(this.infoEl);
    this.infoEl.appendChild(this.nameEl);
    this.infoEl.appendChild(this.descEl);
    this.settingEl.appendChild(this.controlEl);
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

  then(cb: (setting: Setting) => any): this {
    cb(this);
    return this;
  }

  addText(cb: (text: any) => any): this {
    const textEl = document.createElement('input');
    textEl.type = 'text';
    textEl.className = 'setting-item-input';
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

  addTextArea(cb: (text: any) => any): this {
    const textEl = document.createElement('textarea');
    textEl.className = 'setting-item-input';
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
    selectEl.className = 'setting-item-select';
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

  addSlider(cb: (slider: any) => any): this {
    const sliderEl = document.createElement('input');
    sliderEl.type = 'range';
    this.controlEl.appendChild(sliderEl);
    
    const sliderComponent = {
      sliderEl,
      setLimits: (min: number, max: number, step: number) => {
        sliderEl.min = min.toString();
        sliderEl.max = max.toString();
        sliderEl.step = step.toString();
        return sliderComponent;
      },
      setValue: (value: number) => {
        sliderEl.value = value.toString();
        return sliderComponent;
      },
      getValue: () => parseFloat(sliderEl.value),
      setDynamicTooltip: () => {
        return sliderComponent;
      },
      onChange: (callback: (value: number) => void) => {
        sliderEl.addEventListener('input', () => callback(parseFloat(sliderEl.value)));
        return sliderComponent;
      }
    };
    
    cb(sliderComponent);
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
      basePath: '/mock/vault/path',
      exists: jest.fn().mockResolvedValue(false),
      read: jest.fn().mockResolvedValue('{}'),
      write: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue({ files: [], folders: [] }),
      mkdir: jest.fn().mockResolvedValue(undefined),
      rmdir: jest.fn().mockResolvedValue(undefined),
    };
  }

  getConfig(key: string): any {
    return undefined;
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

  // Add basePath getter for compatibility
  get basePath(): string {
    return this.adapter.basePath;
  }
}

// Mock WorkspaceLeaf class
export class WorkspaceLeaf {
  view: any;
  containerEl: HTMLElement;

  constructor() {
    this.view = null;
    this.containerEl = document.createElement('div');
  }

  setViewState(viewState: any): void {
    // Mock implementation
  }

  detach(): void {
    // Mock implementation
  }
}

// Mock Workspace class
export class Workspace {
  leftRibbon: any;
  rightRibbon: any;
  containerEl: HTMLElement;
  _eventListeners: Map<string, Function[]>;

  constructor() {
    this.leftRibbon = {
      addRibbonItem: jest.fn().mockReturnValue({
        setTitle: jest.fn().mockReturnThis(),
        setIcon: jest.fn().mockReturnThis(),
        onClick: jest.fn().mockReturnThis()
      })
    };
    this.rightRibbon = {
      addRibbonItem: jest.fn().mockReturnValue({
        setTitle: jest.fn().mockReturnThis(),
        setIcon: jest.fn().mockReturnThis(),
        onClick: jest.fn().mockReturnThis()
      })
    };
    this.containerEl = document.createElement('div');
    this._eventListeners = new Map();
  }

  getLeavesOfType(type: string): WorkspaceLeaf[] {
    return [];
  }

  getActiveViewOfType(type: string): any {
    return null;
  }

  getActiveFile(): TFile | null {
    return null;
  }

  async openLinkText(linkText: string, sourcePath: string, inNewLeaf?: boolean): Promise<void> {
    // Mock implementation
  }

  createLeafBySplit(leaf: WorkspaceLeaf, direction: string): WorkspaceLeaf {
    return new WorkspaceLeaf();
  }

  setActiveLeaf(leaf: WorkspaceLeaf): void {
    // Mock implementation
  }

  on(eventType: string, callback: Function): any {
    if (!this._eventListeners.has(eventType)) {
      this._eventListeners.set(eventType, []);
    }
    this._eventListeners.get(eventType)!.push(callback);
    
    // Return a reference object that can be used with offref
    return {
      eventType,
      callback,
      unsubscribe: () => {
        const listeners = this._eventListeners.get(eventType);
        if (listeners) {
          const index = listeners.indexOf(callback);
          if (index > -1) {
            listeners.splice(index, 1);
          }
        }
      }
    };
  }

  offref(ref: any): void {
    if (ref && ref.unsubscribe) {
      ref.unsubscribe();
    }
  }

  off(eventType: string, callback: Function): void {
    const listeners = this._eventListeners.get(eventType);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  trigger(eventType: string, ...args: any[]): void {
    const listeners = this._eventListeners.get(eventType);
    if (listeners) {
      listeners.forEach(callback => callback(...args));
    }
  }
}

// Mock App class
export class App {
  vault: Vault;
  workspace: Workspace;
  commands: any;
  metadataCache: any;
  fileManager: any;

  constructor() {
    this.vault = new Vault();
    this.workspace = new Workspace();
    this.commands = {
      addCommand: jest.fn(),
      removeCommand: jest.fn(),
      executeCommandById: jest.fn().mockResolvedValue(undefined)
    };
    this.metadataCache = {
      getFileCache: jest.fn().mockReturnValue(null),
      getCache: jest.fn().mockReturnValue(null)
    };
    this.fileManager = {
      processFrontMatter: jest.fn().mockResolvedValue(undefined)
    };
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

// Mock FuzzySuggestModal class
export class FuzzySuggestModal<T> extends Modal {
  constructor(app: any) {
    super(app);
  }

  getItems(): T[] {
    return [];
  }

  getItemText(item: T): string {
    return String(item);
  }

  onChooseItem(item: T, evt: MouseEvent | KeyboardEvent): void {
    // Mock implementation
  }

  open(): void {
    super.open();
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

export class ItemView extends Component {
  app: any;
  contentEl: HTMLElement;
  containerEl: HTMLElement;

  constructor(leaf: any) {
    super();
    this.app = leaf?.view?.app || {};
    this.contentEl = document.createElement('div');
    this.containerEl = document.createElement('div');
  }

  getViewType(): string {
    return 'item-view';
  }

  getDisplayText(): string {
    return 'Item View';
  }

  getIcon(): string {
    return 'file';
  }

  async onOpen(): Promise<void> {
    // Mock implementation
  }

  async onClose(): Promise<void> {
    // Mock implementation
  }
}

// Export commonly used types and interfaces
export interface App {
  vault: Vault;
  workspace: Workspace;
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

// Mock Obsidian DOM extension methods
declare global {
  interface HTMLElement {
    empty(): void;
    createDiv(className?: string): HTMLDivElement;
    createEl<K extends keyof HTMLElementTagNameMap>(tagName: K, options?: string | { text?: string; cls?: string; attr?: Record<string, string> }): HTMLElementTagNameMap[K];
    addClass(...classNames: string[]): void;
    removeClass(...classNames: string[]): void;
    toggleClass(className: string, value?: boolean): void;
    hasClass(className: string): boolean;
    setAttr(attr: string, value: string): void;
    setText(text: string): void;
  }
}

// Implement DOM extension methods
HTMLElement.prototype.empty = function(): void {
  while (this.firstChild) {
    this.removeChild(this.firstChild);
  }
};

HTMLElement.prototype.createDiv = function(className?: string): HTMLDivElement {
  const div = document.createElement('div');
  if (className) {
    div.className = className;
  }
  this.appendChild(div);
  return div;
};

HTMLElement.prototype.createEl = function<K extends keyof HTMLElementTagNameMap>(
  tagName: K, 
  options?: string | { text?: string; cls?: string; attr?: Record<string, string> }
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tagName);
  
  // Handle both string (className) and object (options) parameter
  if (typeof options === 'string') {
    el.className = options;
  } else if (options && typeof options === 'object') {
    if (options.text) el.textContent = options.text;
    if (options.cls) el.className = options.cls;
    if (options.attr) {
      for (const [key, value] of Object.entries(options.attr)) {
        el.setAttribute(key, value);
      }
    }
  }
  
  this.appendChild(el);
  return el as HTMLElementTagNameMap[K];
};

HTMLElement.prototype.setAttr = function(attr: string, value: string): void {
  this.setAttribute(attr, value);
};

HTMLElement.prototype.setText = function(text: string): void {
  this.textContent = text;
};

HTMLElement.prototype.addClass = function(...classNames: string[]): void {
  this.classList.add(...classNames);
};

HTMLElement.prototype.removeClass = function(...classNames: string[]): void {
  this.classList.remove(...classNames);
};

HTMLElement.prototype.toggleClass = function(className: string, value?: boolean): void {
  if (value !== undefined) {
    this.classList.toggle(className, value);
  } else {
    this.classList.toggle(className);
  }
};

HTMLElement.prototype.hasClass = function(className: string): boolean {
  return this.classList.contains(className);
};

// Mock activateView function
export async function activateView(app: App, viewType: string): Promise<void> {
  // Mock implementation - simulate activating a view
  const leaves = app.workspace.getLeavesOfType(viewType);
  if (leaves.length > 0) {
    app.workspace.setActiveLeaf(leaves[0]);
  }
}

// Mock showNotice function
export function showNotice(message: string): void {
  // Mock implementation - could log to console or just do nothing
}

// Mock registerAllCommands function
export function registerAllCommands(
  plugin: any,
  settings: any,
  processMessages: any,
  activateChatViewAndLoadMessages: any,
  activeStreamRef: any,
  setActiveStream: any,
  yamlAttributeCommandIds: string[]
): string[] {
  // Mock implementation - return some mock command IDs
  return ['mock-command-1', 'mock-command-2'];
}

// Mock registerYamlAttributeCommands function
export function registerYamlAttributeCommands(
  plugin: any,
  settings: any,
  processMessages: any,
  yamlAttributeCommandIds: string[],
  debugLog: any
): string[] {
  // Mock implementation - return some mock command IDs
  return ['yaml-command-1', 'yaml-command-2'];
}