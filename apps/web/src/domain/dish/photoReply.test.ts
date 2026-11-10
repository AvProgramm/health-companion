import { describe, expect, it } from 'vitest';
import { photoEntry, readPhotoReply } from './photoReply';

describe('readPhotoReply', () => {
  it('accepts a list of foods and who wrote it', () => {
    const reply = readPhotoReply({ mode: 'foods', message: 'm', foods: [{ name: 'dal', entry: '1 bowl of dal' }], answeredBy: 'Gemini' });
    expect(reply.foods[0]!.entry).toBe('1 bowl of dal');
  });

  it.each([null, {}, { mode: 'other', message: 'm', foods: [] }, { mode: 'foods', message: 'm', foods: [{ name: 'dal' }] },
    { mode: 'foods', message: 'm', foods: [{ name: 'dal', entry: '  ' }] }, { mode: 'foods', message: 'm', foods: [], answeredBy: 7 }])('rejects a malformed reply: %j', (value) => {
    expect(() => readPhotoReply(value)).toThrow(/could not read/);
  });
});

describe('photoEntry', () => {
  it('joins the foods with commas, so each becomes its own draft item', () => {
    expect(photoEntry([{ name: 'almonds', entry: '12 almonds' }, { name: 'milk', entry: '1 glass of milk' }])).toBe('12 almonds, 1 glass of milk');
  });
});
