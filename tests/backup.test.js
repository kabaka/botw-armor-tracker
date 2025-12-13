import { describe, expect, it } from 'vitest';
import { MAX_BACKUP_SIZE_BYTES, parseBackupContent, parseBackupFile } from '../src/backup.js';

const SAMPLE_DATA = {
  schemaVersion: 1,
  materials: [
    { id: 'mat-a', name: 'Amber' },
    { id: 'mat-b', name: 'Opal' }
  ],
  armorPieces: [
    {
      id: 'piece-1',
      name: 'Test Helm',
      slot: 'head',
      materialsByLevel: {
        '1': [{ material: 'Amber', qty: 2 }],
        '2': [{ material: 'Opal', qty: 1 }]
      }
    }
  ]
};

const SAMPLE_STATE = {
  schemaVersion: 2,
  levels: { 'piece-1': 3 },
  inventory: { 'mat-a': 8, 'mat-b': 2 },
  ui: { openCats: [], openPieces: [], materials: { deficitsOnly: true, sort: 'alpha' } },
  lastUpdated: '2024-01-01T00:00:00.000Z'
};

function makePayload(overrides = {}){
  return {
    data: { ...SAMPLE_DATA, ...(overrides.data || {}) },
    state: { ...SAMPLE_STATE, ...(overrides.state || {}) }
  };
}

describe('backup parsing', () => {
  it('parses valid backup content and clamps values', () => {
    const text = JSON.stringify(makePayload({ state: { levels: { 'piece-1': 9 }, inventory: { 'mat-a': -2, 'mat-b': 123456 } } }));
    const result = parseBackupContent(text);
    expect(result.data.armorPieces.length).toBe(1);
    expect(result.state.levels['piece-1']).toBe(4);
    expect(result.state.inventory['mat-a']).toBe(0);
    expect(result.state.inventory['mat-b']).toBe(99999);
    expect(result.state.ui.materials.sort).toBe('alpha');
  });

  it('rejects backups that do not reference known materials', () => {
    const bad = makePayload({
      data: {
        ...SAMPLE_DATA,
        armorPieces: [
          {
            ...SAMPLE_DATA.armorPieces[0],
            materialsByLevel: { '1': [{ material: 'Missing', qty: 1 }] }
          }
        ]
      }
    });
    expect(() => parseBackupContent(JSON.stringify(bad))).toThrow(/unknown materials/i);
  });

  it('rejects malformed content', () => {
    expect(() => parseBackupContent('')).toThrow(/empty/i);
    const badPayload = { data: { ...SAMPLE_DATA, materials: [] }, state: SAMPLE_STATE };
    expect(() => parseBackupContent(JSON.stringify(badPayload))).toThrow(/materials list/i);
  });

  it('rejects oversized payloads', () => {
    const huge = 'x'.repeat(MAX_BACKUP_SIZE_BYTES + 1);
    expect(() => parseBackupContent(huge)).toThrow(/too large/i);
  });

  it('respects file type and size when using File inputs', async () => {
    const file = new File([JSON.stringify(makePayload())], 'backup.json', { type: 'application/json' });
    const parsed = await parseBackupFile(file);
    expect(parsed.state.levels['piece-1']).toBe(3);

    const badType = new File(['{}'], 'backup.txt', { type: 'text/plain' });
    await expect(parseBackupFile(badType)).rejects.toThrow(/JSON file/i);
  });
});
