jest.mock('./modelRouter', () => ({
  callModel: jest.fn(),
}));

import { callModel } from './modelRouter';
import handler from '../api/read-scale';
import { parseScaleReading, readScaleImage } from './scaleVision';

const reply = (text: string) => ({ content: [{ type: 'text', text }] });

function mockRes() {
  const res: any = { statusCode: 0, body: undefined };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: unknown) => {
    res.body = body;
    return res;
  };
  return res;
}

describe('parseScaleReading', () => {
  it('reads a weight and its unit', () => {
    expect(parseScaleReading('{"weight":181.8,"unit":"lb"}')).toEqual({ weight: 181.8, unit: 'lb' });
    expect(parseScaleReading('{"weight":82.46,"unit":"kg"}')).toEqual({ weight: 82.5, unit: 'kg' });
  });

  it('accepts JSON wrapped in other text', () => {
    expect(parseScaleReading('Here you go: {"weight":150,"unit":null} thanks')).toEqual({ weight: 150, unit: null });
  });

  it('gives no reading when the model could not see one', () => {
    expect(parseScaleReading('{"weight":null,"unit":null}')).toEqual({ weight: null, unit: null });
  });

  it('refuses a number no person could weigh, instead of passing on a misread digit', () => {
    expect(parseScaleReading('{"weight":18.2,"unit":"lb"}')).toEqual({ weight: null, unit: null });
    expect(parseScaleReading('{"weight":1824,"unit":"lb"}')).toEqual({ weight: null, unit: null });
    expect(parseScaleReading('{"weight":650,"unit":"kg"}')).toEqual({ weight: null, unit: null });
  });

  it('throws on prose, so the rotation moves to the next free provider', () => {
    expect(() => parseScaleReading('The scale shows about 180 pounds.')).toThrow();
  });
});

describe('readScaleImage', () => {
  beforeEach(() => (callModel as jest.Mock).mockReset());

  it('asks the free rotation only, with the image attached', async () => {
    (callModel as jest.Mock).mockResolvedValue(reply('{"weight":181.8,"unit":"lb"}'));
    await expect(readScaleImage('abc', 'image/jpeg')).resolves.toEqual({ weight: 181.8, unit: 'lb' });
    const [params, opts] = (callModel as jest.Mock).mock.calls[0];
    expect(opts.freeOnly).toBe(true);
    expect(params.messages[0].content[0]).toMatchObject({ type: 'image', source: { data: 'abc', media_type: 'image/jpeg' } });
  });
});

describe('/api/read-scale', () => {
  beforeEach(() => (callModel as jest.Mock).mockReset());

  it('returns the reading', async () => {
    (callModel as jest.Mock).mockResolvedValue(reply('{"weight":181.8,"unit":"lb"}'));
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { imageBase64: 'abc' } } as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ weight: 181.8, unit: 'lb' });
  });

  it('rejects a request with no image, and anything but POST', async () => {
    const noImage = mockRes();
    await handler({ method: 'POST', headers: {}, body: {} } as any, noImage);
    expect(noImage.statusCode).toBe(400);
    const wrongMethod = mockRes();
    await handler({ method: 'GET', headers: {}, body: {} } as any, wrongMethod);
    expect(wrongMethod.statusCode).toBe(405);
  });

  it('says so plainly (503) when every free provider is out, rather than spending', async () => {
    (callModel as jest.Mock).mockRejectedValue(Object.assign(new Error('all declined'), { allDeclined: true, declined: ['cloudflare: quota'] }));
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { imageBase64: 'abc' } } as any, res);
    expect(res.statusCode).toBe(503);
  });
});
