import { describe, expect, it } from 'vitest';
import { providerInitials } from './avatar';

describe('providerInitials', () => {
  it('takes the first letters of the first two words', () => {
    expect(providerInitials('Amazon Web Services')).toBe('AW');
    expect(providerInitials('Mistral AI')).toBe('MA');
    expect(providerInitials('Other providers')).toBe('OP');
  });
  it('takes two capitals from a camel-case word, otherwise the first two letters', () => {
    expect(providerInitials('OpenAI')).toBe('OA');
    expect(providerInitials('ElevenLabs')).toBe('EL');
    expect(providerInitials('Cursor')).toBe('CU');
    expect(providerInitials('x')).toBe('X');
  });
  it('splits on punctuation and never returns an empty string', () => {
    expect(providerInitials('Open-Router')).toBe('OR');
    expect(providerInitials('  ')).toBe('?');
    expect(providerInitials('…')).toBe('?');
  });
});
