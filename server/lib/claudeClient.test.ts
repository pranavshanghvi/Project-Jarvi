jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{"items":[]}' }],
      }),
    },
  }));
});

import { analyzeImageWithClaude } from './claudeClient';

describe('analyzeImageWithClaude', () => {
  it('returns the text content from Claude response', async () => {
    const text = await analyzeImageWithClaude('base64data', 'image/jpeg');
    expect(text).toBe('{"items":[]}');
  });
});
