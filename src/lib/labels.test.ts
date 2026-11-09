import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { normalizeProviderCategories } from './categories';
import { clearAll, closeDb, loadSetting, saveSetting } from './db';
import { cleanLabel, labelMap, labelOf, MAX_LABEL_LENGTH, normalizeLabels, streamName, tidyDescriptor, withLabel } from './labels';

const D = 'ANTHROPIC* CLAUDE SUB   SAN FRANCISCO';

describe('service labels', () => {
  it('falls back to the tidied descriptor when there is no label', () => {
    const map = labelMap([]);
    expect(streamName(map, 'Anthropic', D)).toBe('ANTHROPIC* CLAUDE SUB · SAN FRANCISCO');
    expect(tidyDescriptor('  A  B ')).toBe('A · B');
  });

  it('shows the label for the exact stream only', () => {
    const map = labelMap(withLabel([], 'Anthropic', D, 'Claude Pro'));
    expect(streamName(map, 'Anthropic', D)).toBe('Claude Pro');
    expect(labelOf(map, 'Anthropic', 'Anthropic')).toBeUndefined();
    expect(labelOf(map, 'OpenAI', D)).toBeUndefined();
  });

  it('sets, replaces and removes a label; empty or blank text removes it', () => {
    let list = withLabel([], 'A', 'x', 'One');
    list = withLabel(list, 'B', 'y', 'Two');
    list = withLabel(list, 'A', 'x', 'Uno');
    expect(list).toEqual([{ provider: 'B', merchant: 'y', label: 'Two' }, { provider: 'A', merchant: 'x', label: 'Uno' }]);
    expect(withLabel(list, 'A', 'x', '   ')).toEqual([{ provider: 'B', merchant: 'y', label: 'Two' }]);
    expect(withLabel(list, 'B', 'y', null)).toEqual([{ provider: 'A', merchant: 'x', label: 'Uno' }]);
  });

  it('keeps a label to one short line', () => {
    expect(cleanLabel('  Claude \n  Pro  ')).toBe('Claude Pro');
    expect(cleanLabel('x'.repeat(100))).toHaveLength(MAX_LABEL_LENGTH);
  });

  it('cleans what it reads back from storage', () => {
    expect(
      normalizeLabels([
        { provider: 'B', merchant: 'm', label: ' Two ' },
        { provider: 'A', merchant: 'm', label: 'One', extra: 1 },
        { provider: 'A', merchant: 'm', label: 'One again' },
        { provider: 'C', merchant: 'm', label: '   ' },
        { provider: '', merchant: 'm', label: 'x' },
        { provider: 'D', merchant: 'm', label: 5 },
        'junk',
      ]),
    ).toEqual([
      { provider: 'A', merchant: 'm', label: 'One again' },
      { provider: 'B', merchant: 'm', label: 'Two' },
    ]);
    expect(normalizeLabels(null)).toEqual([]);
  });
});

describe('provider category storage', () => {
  beforeEach(async () => {
    await clearAll();
  });
  it('keeps categories across a reload and removes them with Clear local data', async () => {
    await saveSetting('providerCategories', [{ provider: 'A', category: 'media' }]);
    await closeDb();
    expect(normalizeProviderCategories(await loadSetting('providerCategories'))).toEqual([{ provider: 'A', category: 'media' }]);
    await clearAll();
    expect(await loadSetting('providerCategories')).toBeUndefined();
  });
});

describe('label storage', () => {
  beforeEach(async () => {
    await clearAll();
  });
  it('keeps labels across a reload and removes them with Clear local data', async () => {
    await saveSetting('labels', [{ provider: 'A', merchant: 'm', label: 'One' }]);
    await closeDb();
    expect(normalizeLabels(await loadSetting('labels'))).toEqual([{ provider: 'A', merchant: 'm', label: 'One' }]);
    await clearAll();
    expect(await loadSetting('labels')).toBeUndefined();
  });
});
