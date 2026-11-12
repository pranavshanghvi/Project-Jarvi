import { applyCors, isAllowedOrigin } from './cors';

function mockRes() {
  const res: any = { headers: {} as Record<string, string>, statusCode: 0, ended: false };
  res.setHeader = (k: string, v: string) => { res.headers[k] = v; };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.end = () => { res.ended = true; return res; };
  return res;
}

describe('isAllowedOrigin', () => {
  it('allows the web version and a local test server', () => {
    expect(isAllowedOrigin('https://mybitelog.vercel.app', '')).toBe(true);
    expect(isAllowedOrigin('https://jarvi-web.vercel.app', '')).toBe(true);
    expect(isAllowedOrigin('http://localhost:4173', '')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:8081', '')).toBe(true);
  });

  it('refuses any other website, including look-alikes', () => {
    expect(isAllowedOrigin('https://example.com', '')).toBe(false);
    expect(isAllowedOrigin('https://jarvi-web.vercel.app.evil.com', '')).toBe(false);
    // Other people's sites that happen to have BiteLog in the name are not ours.
    expect(isAllowedOrigin('https://bitelog.vercel.app', '')).toBe(false);
    expect(isAllowedOrigin('http://localhost.evil.com', '')).toBe(false);
    expect(isAllowedOrigin(undefined, '')).toBe(false);
  });

  it('accepts extra addresses from the setting', () => {
    expect(isAllowedOrigin('https://bitelog.example', 'https://bitelog.example, https://other.example')).toBe(true);
  });
});

describe('applyCors', () => {
  it('answers the browser\'s advance check without running the reader', () => {
    const res = mockRes();
    expect(applyCors({ method: 'OPTIONS', headers: { origin: 'https://jarvi-web.vercel.app' } } as any, res)).toBe(true);
    expect(res.statusCode).toBe(204);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://jarvi-web.vercel.app');
  });

  it('adds no permission for a site that is not allowed', () => {
    const res = mockRes();
    expect(applyCors({ method: 'POST', headers: { origin: 'https://example.com' } } as any, res)).toBe(false);
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('lets the phone app through untouched (it sends no origin)', () => {
    const res = mockRes();
    expect(applyCors({ method: 'POST', headers: {} } as any, res)).toBe(false);
  });
});
