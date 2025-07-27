// Mock console before imports to catch all warnings
const originalConsole = { ...console };
console.warn = jest.fn();
console.log = jest.fn().mockImplementation((msg) => {
  if (typeof msg === 'string' && msg.includes('--- AGENT SYSTEM PROMPT ---')) {
    originalConsole.log(msg);
  }
});

import {
  DEFAULT_TITLE_PROMPT,
  DEFAULT_SUMMARY_PROMPT,
  DEFAULT_GENERAL_SYSTEM_PROMPT,
  AGENT_SYSTEM_PROMPT_TEMPLATE,
  buildAgentSystemPrompt,
  AGENT_SYSTEM_PROMPT,
  DEFAULT_YAML_SYSTEM_MESSAGE
} from '../src/promptConstants';

describe('promptConstants', () => {
  afterAll(() => {
    console.warn = originalConsole.warn;
    console.log = originalConsole.log;
  });
  it('should print the agent system prompt for inspection', () => {
    const prompt = buildAgentSystemPrompt({});
    // eslint-disable-next-line no-console
    console.log('\n--- AGENT SYSTEM PROMPT ---\n' + prompt + '\n--------------------------\n');
    expect(typeof prompt).toBe('string');
  });
  it('should export default prompts as strings', () => {
    expect(typeof DEFAULT_TITLE_PROMPT).toBe('string');
    expect(typeof DEFAULT_SUMMARY_PROMPT).toBe('string');
    expect(typeof DEFAULT_GENERAL_SYSTEM_PROMPT).toBe('string');
    expect(typeof AGENT_SYSTEM_PROMPT_TEMPLATE).toBe('string');
    expect(typeof AGENT_SYSTEM_PROMPT).toBe('string');
    expect(typeof DEFAULT_YAML_SYSTEM_MESSAGE).toBe('string');
  });

  it('should build agent system prompt with tool descriptions', () => {
    const prompt = buildAgentSystemPrompt({});
    expect(prompt).toContain('Available tools:');
    expect(prompt).toContain('thought'); // Always included
  });

  it('should allow custom template in buildAgentSystemPrompt', () => {
    const custom = 'CUSTOM_TEMPLATE {{TOOL_DESCRIPTIONS}}';
    const prompt = buildAgentSystemPrompt({}, custom);
    expect(prompt.startsWith('CUSTOM_TEMPLATE')).toBe(true);
    expect(prompt).toContain('thought');
  });
});