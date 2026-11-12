import { describe, expect, it } from 'vitest';
import { PALETTE } from '../lib/colors';
import { avatarColors, contrastRatio, mixHex, providerInitials } from './avatar';

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

describe('avatarColors', () => {
  it('mixes like CSS color-mix', () => {
    expect(mixHex('#000000', '#ffffff', 0.25)).toBe('#bfbfbf');
  });

  it('keeps the initials readable (4.5:1 or better) on the tint of every colour in the palette, light and dark, grey included', () => {
    for (const scheme of ['light', 'dark'] as const) {
      expect(PALETTE[scheme]).toHaveLength(8);
      for (const color of PALETTE[scheme]) {
        const { background, color: ink } = avatarColors(color, scheme);
        expect(contrastRatio(background, ink), `${scheme} ${color}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('is a light tint in light mode and a dark one in dark mode', () => {
    expect(contrastRatio(avatarColors('#2a78d6', 'light').background, '#ffffff')).toBeLessThan(1.4);
    expect(contrastRatio(avatarColors('#3987e5', 'dark').background, '#1a1a19')).toBeLessThan(1.6);
  });
});
