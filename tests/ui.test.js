import { describe, expect, it } from 'vitest';
import { cssEscape, escapeHtml, groupBy, sanitizeUrl, summarizeMaterialNeeds } from '../src/ui.js';

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
});
