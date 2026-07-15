import { parseClaudeResponse } from './parseResponse';

describe('parseClaudeResponse', () => {
  it('parses a well-formed Claude JSON response into itemized nutrients', () => {
    const raw = JSON.stringify({
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
    });
    const result = parseClaudeResponse(raw);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Grilled chicken');
  });

  it('throws when the response is not valid JSON', () => {
    expect(() => parseClaudeResponse('not json')).toThrow('Claude response was not valid JSON');
  });

  it('throws when items is missing', () => {
    expect(() => parseClaudeResponse(JSON.stringify({}))).toThrow('Claude response missing "items" array');
  });

  it('throws when an item is missing required nutrient fields', () => {
    const raw = JSON.stringify({ items: [{ name: 'X', confidence: 'normal', portionDescription: 'a', nutrients: { calories: 1 } }] });
    expect(() => parseClaudeResponse(raw)).toThrow('Claude item "X" is missing nutrient fields');
  });
});
