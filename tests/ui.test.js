import { describe, expect, it } from 'vitest';
import { cssEscape, escapeHtml, groupBy, sanitizeUrl } from '../src/ui.js';

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
});
