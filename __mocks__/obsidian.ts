export const Notice = jest.fn();

// Mock Modal base class for Obsidian
export class Modal {
  app: any;
  constructor(app: any) {
    this.app = app;
  }
  open() {}
  close() {}
}

// Add other Obsidian mocks as needed