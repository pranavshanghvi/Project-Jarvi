import { withTimeout } from './webImage';

describe('withTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('passes a result through when the work finishes in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000, 'Reading')).resolves.toBe('ok');
  });

  it('passes a failure through unchanged', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000, 'Reading')).rejects.toThrow('boom');
  });

  it('gives up on work that never finishes, instead of waiting for ever', async () => {
    const stuck = withTimeout(new Promise(() => {}), 1000, 'Reading the photo');
    jest.advanceTimersByTime(1001);
    await expect(stuck).rejects.toThrow('Reading the photo took too long');
  });
});
