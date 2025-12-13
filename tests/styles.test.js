import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

function getRuleBlock(css, selector){
  const regex = new RegExp(`${selector}\\s*{([^}]*)}`, 'm');
  const match = css.match(regex);
  return match ? match[1] : '';
}

describe('styles', () => {
  it('allows material acquisition metadata to wrap', () => {
    const cssPath = path.resolve(process.cwd(), 'styles.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const block = getRuleBlock(css, '\\.mat-acq-inline');

    expect(block).toContain('white-space:normal');
    expect(block).not.toContain('white-space:nowrap');
  });
});
