import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('./modelRouter', () => ({
  callModel: jest.fn(),
}));

import { callModel } from './modelRouter';
import { analyzeFoodImage } from './foodVision';

const mockedCallModel = callModel as unknown as jest.Mock;

describe('analyzeFoodImage', () => {
  beforeEach(() => {
    mockedCallModel.mockReset();
    mockedCallModel.mockResolvedValue({ content: [{ type: 'text', text: '{"items":[]}' }] });
  });

  it('always asks the router for free providers only', async () => {
    await analyzeFoodImage('base64data', 'image/jpeg');
    const [, opts] = mockedCallModel.mock.calls[0];
    expect(opts.freeOnly).toBe(true);
  });

  it('sends the photo as an image block and returns the model text', async () => {
    const text = await analyzeFoodImage('base64data', 'image/png');
    const [params] = mockedCallModel.mock.calls[0];
    const image = params.messages[0].content.find((b: any) => b.type === 'image');
    expect(image.source).toEqual({ type: 'base64', media_type: 'image/png', data: 'base64data' });
    expect(text).toBe('{"items":[]}');
  });

  it('gives the router a validator that rejects prose, so the rotation moves on', async () => {
    await analyzeFoodImage('base64data', 'image/jpeg');
    const [, opts] = mockedCallModel.mock.calls[0];
    expect(() => opts.validate({ content: [{ type: 'text', text: 'I cannot read this image.' }] })).toThrow();
    expect(() => opts.validate({ content: [{ type: 'text', text: '{"items":[]}' }] })).not.toThrow();
  });
});

describe('vendored model router', () => {
  it('is byte-for-byte the copy recorded in PROVENANCE.md', () => {
    const hash = createHash('sha256').update(readFileSync(join(__dirname, 'modelRouter.js'))).digest('hex');
    const provenance = readFileSync(join(__dirname, 'PROVENANCE.md'), 'utf8');
    expect(provenance).toContain(hash);
  });

  it('cannot reach the paid SDK: the stub throws on construction', () => {
    const Anthropic = jest.requireActual('@anthropic-ai/sdk');
    expect(() => new Anthropic()).toThrow(/Refusing to call a paid AI API/);
  });
});
