/**
 * @file factories.ts
 * @description Test data factories for consistent test data generation
 */

import { Message, MessageRole } from '../../src/types/chat';
import { MyPluginSettings, DEFAULT_SETTINGS } from '../../src/types/settings';
import { AIProvider } from '../../src/types/providers';

/**
 * Creates a test message with default values
 */
export const createTestMessage = (overrides: Partial<Message> = {}): Message => {
  return {
    role: 'user' as MessageRole,
    content: 'Test message content',
    timestamp: new Date('2025-01-01T12:00:00.000Z'),
    id: 'test-message-id',
    ...overrides,
  };
};

/**
 * Creates a test AI response message
 */
export const createTestAIResponse = (content: string = 'AI response content'): Message => {
  return createTestMessage({
    role: 'assistant',
    content,
    timestamp: new Date('2025-01-01T12:00:01.000Z'),
  });
};

/**
 * Creates a test conversation with multiple messages
 */
export const createTestConversation = (messageCount: number = 3): Message[] => {
  const messages: Message[] = [];
  for (let i = 0; i < messageCount; i++) {
    messages.push(createTestMessage({
      content: `User message ${i + 1}`,
      id: `user-message-${i + 1}`,
      timestamp: new Date(`2025-01-01T12:0${i}:00.000Z`),
    }));

    if (i < messageCount - 1 || messageCount % 2 === 0) {
      messages.push(createTestAIResponse(`AI response ${i + 1}`));
    }
  }
  return messages;
};

/**
 * Creates test plugin settings with custom overrides
 */
export const createTestSettings = (overrides: Partial<MyPluginSettings> = {}): MyPluginSettings => {
  return {
    ...DEFAULT_SETTINGS,
    ...overrides,
  };
};

/**
 * Creates test settings for a specific provider
 */
export const createTestProviderSettings = (
  provider: string,
  apiKey: string = 'test-api-key',
  overrides: Record<string, any> = {}
) => {
  const settings: Record<string, any> = {
    [`${provider}Settings`]: {
      apiKey,
      baseUrl: `https://api.${provider}.com`,
      availableModels: [`${provider}-model-1`, `${provider}-model-2`],
      ...overrides,
    },
  };

  if (provider === 'openai') {
    settings.openaiSettings.organizationId = 'test-org';
  }

  if (provider === 'anthropic') {
    settings.anthropicSettings.maxTokens = 4096;
  }

  return settings;
};

/**
 * Creates a mock AI provider for testing
 */
export const createMockAIProvider = (overrides: Partial<AIProvider> = {}): AIProvider => {
  return {
    id: 'test-provider',
    name: 'Test Provider',
    description: 'Mock provider for testing',
    configFields: {
      apiKey: {
        type: 'string',
        label: 'API Key',
        placeholder: 'Enter your API key',
        required: true,
      },
    },
    getCompletion: jest.fn().mockResolvedValue({
      content: 'Mock AI response',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    }),
    getAvailableModels: jest.fn().mockResolvedValue(['model-1', 'model-2']),
    listModels: jest.fn().mockResolvedValue(['model-1', 'model-2']),
    testConnection: jest.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
};

/**
 * Creates test context notes
 */
export const createTestContextNotes = (count: number = 2): string[] => {
  return Array.from({ length: count }, (_, i) =>
    `# Note ${i + 1}\n\nThis is test note content ${i + 1}.`
  );
};

/**
 * Creates a test file path
 */
export const createTestFilePath = (filename: string = 'test.md'): string => {
  return `vault/${filename}`;
};

/**
 * Creates test YAML frontmatter
 */
export const createTestYAMLFrontmatter = (fields: Record<string, any> = {}): string => {
  const defaultFields = {
    title: 'Test Note',
    tags: ['test', 'ai'],
    created: '2025-01-01',
    ...fields,
  };

  return Object.entries(defaultFields)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
    .join('\n');
};