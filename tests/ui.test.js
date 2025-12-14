import { describe, expect, it } from 'vitest';
import { cssEscape, escapeHtml, getAvailableUpgrades, groupBy, sanitizeUrl, summarizeMaterialNeeds } from '../src/ui.js';

describe('ui helpers', () => {
  it('groups items by selector function', () => {
    const grouped = groupBy(['a', 'aa', 'b'], (str) => str[0]);
    expect(grouped.get('a')).toEqual(['a', 'aa']);
    expect(grouped.get('b')).toEqual(['b']);
  });

  it('escapes html-sensitive characters', () => {
    expect(escapeHtml('<div>"&"</div>')).toBe('&lt;div&gt;&quot;&amp;&quot;&lt;/div&gt;');
  });

  it('escapes css selectors for use in query strings', () => {
    expect(cssEscape("ma'in\"id")).toBe("ma\\'in\\\"id");
  });

  it('sanitizes URLs, allowing only http/https origins', () => {
    expect(sanitizeUrl('https://example.com/path')).toBe('https://example.com/path');
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com/');
    expect(sanitizeUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeUrl('ftp://example.com/file')).toBe('');
  });

  it('summarizes remaining material coverage accurately', () => {
    const remainingReq = new Map([
      ['mat-a', 3],
      ['mat-b', 1]
    ]);
    const inventory = { 'mat-a': 2, 'mat-b': 1, 'mat-c': 10 };
    const materials = [
      { id: 'mat-a', name: 'Amber' },
      { id: 'mat-b', name: 'Opal' }
    ];

    const summary = summarizeMaterialNeeds(remainingReq, inventory, materials);

    expect(summary.requiredUnique).toBe(2);
    expect(summary.deficitUnique).toBe(1);
    expect(summary.coveredUnique).toBe(1);
    expect(summary.items[0].deficit).toBe(1);
  });

  it('never reports covered unique materials as negative', () => {
    const remainingReq = new Map([
      ['mat-a', 5]
    ]);
    const inventory = { 'mat-a': 0 };
    const materials = [{ id: 'mat-a', name: 'Amber' }];

    const summary = summarizeMaterialNeeds(remainingReq, inventory, materials);

    expect(summary.deficitUnique).toBe(1);
    expect(summary.coveredUnique).toBe(0);
  });

  it('surfaces upgrades available with the current inventory', () => {
    const data = {
      materials: [
        { id: 'mat-a', name: 'Amber' },
        { id: 'mat-b', name: 'Opal' }
      ],
      armorPieces: [
        { id: 'cap', name: 'Hylian Hood', materialsByLevel: { 1: [{ material: 'mat-a', qty: 2 }] } },
        { id: 'tunic', name: 'Hylian Tunic', materialsByLevel: { 1: [{ material: 'mat-b', qty: 3 }] } },
        { id: 'boots', name: 'Hylian Trousers', materialsByLevel: { 1: [{ material: 'mat-a', qty: 2 }] } }
      ]
    };

    const state = {
      levels: { cap: 0, tunic: 0, boots: 1 },
      inventory: { 'mat-a': 4, 'mat-b': 2 }
    };

    const upgrades = getAvailableUpgrades(data, state);

    expect(upgrades.map(u => u.pieceId)).toEqual(['cap']);
    expect(upgrades[0].targetLevel).toBe(1);
  });
});
