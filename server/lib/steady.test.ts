import { withSteadyAnswers } from './steady';

describe('withSteadyAnswers', () => {
  it('asks an AI call for its steadiest answer', () => {
    expect(JSON.parse(withSteadyAnswers(JSON.stringify({ model: 'm', max_tokens: 5, messages: [] })))).toEqual({ model: 'm', max_tokens: 5, messages: [], temperature: 0 });
    expect(JSON.parse(withSteadyAnswers(JSON.stringify({ contents: [], generationConfig: { maxOutputTokens: 5 } }))).generationConfig).toEqual({ maxOutputTokens: 5, temperature: 0 });
  });

  it('leaves a chosen setting, and anything that is not an AI call, exactly as it was', () => {
    const chosen = JSON.stringify({ model: 'm', messages: [], temperature: 0.7 });
    expect(withSteadyAnswers(chosen)).toBe(chosen);
    const other = JSON.stringify({ q: 'yogurt' });
    expect(withSteadyAnswers(other)).toBe(other);
    expect(withSteadyAnswers('not json')).toBe('not json');
  });
});
