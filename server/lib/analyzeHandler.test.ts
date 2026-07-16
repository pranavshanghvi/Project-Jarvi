/**
 * Substitute for the manual `vercel dev` + curl verification step (Step 12
 * of the task brief). This session cannot run a long-lived local server and
 * curl it from a second terminal in parallel, and has no real food photo to
 * test with. Instead, this test imports the actual handler from
 * `api/analyze.ts` (which itself imports analyzeImageWithClaude and
 * parseClaudeResponse) with a mocked Anthropic client and a tiny fake
 * base64 string, and drives it with plain mock req/res objects to confirm:
 *   - a well-formed mocked Claude response yields HTTP 200 with {"items": [...]}
 *   - a missing imageBase64 field yields an appropriate error status
 *
 * A human should still run `vercel dev` with a real photo before shipping.
 */

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              items: [
                {
                  name: 'Grilled chicken',
                  confidence: 'normal',
                  portionDescription: '1 breast, ~150g',
                  nutrients: {
                    calories: 250,
                    proteinG: 40,
                    carbsG: 0,
                    fatG: 8,
                    saturatedFatG: 2,
                    fiberG: 0,
                    sugarG: 0,
                    sodiumMg: 90,
                    cholesterolMg: 100,
                  },
                },
              ],
            }),
          },
        ],
      }),
    },
  }));
});

import handler from '../api/analyze';

/** Minimal mock of VercelRequest/VercelResponse sufficient for this handler. */
function createMockReqRes(method: string, body: unknown, headers: Record<string, string> = {}) {
  const req: any = { method, body, headers };
  const res: any = {
    statusCode: undefined as number | undefined,
    jsonBody: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.jsonBody = payload;
      return this;
    },
  };
  return { req, res };
}

describe('analyze handler (vercel dev substitute)', () => {
  it('returns HTTP 200 with a well-formed {"items": [...]} for a mocked success case', async () => {
    const fakeBase64 = 'ZmFrZS1pbWFnZS1kYXRh'; // not a real image; the mock never decodes it
    const { req, res } = createMockReqRes('POST', { imageBase64: fakeBase64, mimeType: 'image/jpeg' });

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.items).toHaveLength(1);
    expect(res.jsonBody.items[0].name).toBe('Grilled chicken');
    expect(res.jsonBody.items[0].nutrients).toEqual({
      calories: 250,
      proteinG: 40,
      carbsG: 0,
      fatG: 8,
      saturatedFatG: 2,
      fiberG: 0,
      sugarG: 0,
      sodiumMg: 90,
      cholesterolMg: 100,
    });
  });

  it('returns an error status when imageBase64 is missing', async () => {
    const { req, res } = createMockReqRes('POST', {});

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toBe('imageBase64 is required');
  });

  it('returns 405 for non-POST methods', async () => {
    const { req, res } = createMockReqRes('GET', {});

    await handler(req, res);

    expect(res.statusCode).toBe(405);
  });

  it('returns 502 when Claude API fails', async () => {
    // Get the mocked Anthropic constructor and make it return a failing client for this test
    const Anthropic = require('@anthropic-ai/sdk');
    Anthropic.mockImplementationOnce(() => ({
      messages: {
        create: jest.fn().mockRejectedValue(new Error('Claude API error')),
      },
    }));

    const fakeBase64 = 'ZmFrZS1pbWFnZS1kYXRh';
    const { req, res } = createMockReqRes('POST', { imageBase64: fakeBase64, mimeType: 'image/jpeg' });

    await handler(req, res);

    expect(res.statusCode).toBe(502);
    expect(res.jsonBody.error).toBe('Claude API error');
  });
});

describe('analyze handler (shared-secret gate)', () => {
  const fakeBase64 = 'ZmFrZS1pbWFnZS1kYXRh';

  afterEach(() => {
    delete process.env.PROXY_SHARED_SECRET;
  });

  it('allows requests through with no secret header when PROXY_SHARED_SECRET is unset', async () => {
    delete process.env.PROXY_SHARED_SECRET;
    const { req, res } = createMockReqRes('POST', { imageBase64: fakeBase64, mimeType: 'image/jpeg' });

    await handler(req, res);

    expect(res.statusCode).toBe(200);
  });

  it('rejects requests with a missing or wrong secret when PROXY_SHARED_SECRET is set', async () => {
    process.env.PROXY_SHARED_SECRET = 'correct-secret';
    const { req, res } = createMockReqRes('POST', { imageBase64: fakeBase64, mimeType: 'image/jpeg' }, {
      'x-proxy-secret': 'wrong-secret',
    });

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.jsonBody.error).toBe('Unauthorized');
  });

  it('allows requests with the correct secret when PROXY_SHARED_SECRET is set', async () => {
    process.env.PROXY_SHARED_SECRET = 'correct-secret';
    const { req, res } = createMockReqRes('POST', { imageBase64: fakeBase64, mimeType: 'image/jpeg' }, {
      'x-proxy-secret': 'correct-secret',
    });

    await handler(req, res);

    expect(res.statusCode).toBe(200);
  });
});
