import { describe, expect, it, beforeEach } from 'vitest';
import {
  clampInt,
  counts,
  defaultState,
  ensureStateAligned,
  migrateOldStateIfNeeded,
  sumRemainingRequirements,
  validateData
} from '../src/state.js';

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
        '2': [{ material: 'Opal', qty: 1 }],
        '3': [{ material: 'Amber', qty: 1 }],
        '4': [{ material: 'Opal', qty: 2 }]
      }
    },
    {
      id: 'piece-2',
      name: 'Test Chest',
      slot: 'body',
      materialsByLevel: {
        '1': [{ material: 'Opal', qty: 3 }],
        '2': [{ material: 'Amber', qty: 1 }],
        '3': [{ material: 'Amber', qty: 2 }],
        '4': [{ material: 'Opal', qty: 4 }]
      }
    }
  ]
};

describe('data validation and defaults', () => {
  it('validates core data shape', () => {
    expect(validateData(SAMPLE_DATA)).toBe(true);
    expect(validateData({ ...SAMPLE_DATA, materials: null })).toBe(false);
    expect(validateData({ ...SAMPLE_DATA, schemaVersion: 2 })).toBe(false);
  });

  it('creates a zeroed default state', () => {
    const state = defaultState(SAMPLE_DATA);
    expect(state.schemaVersion).toBe(2);
    expect(state.levels).toEqual({ 'piece-1': 0, 'piece-2': 0 });
    expect(state.inventory).toEqual({ 'mat-a': 0, 'mat-b': 0 });
    expect(state.ui).toEqual({ openCats: [], openPieces: [] });
  });
});

describe('state migration and alignment', () => {
  it('migrates legacy upgrade flags to level counts', () => {
    const migrated = migrateOldStateIfNeeded({
      schemaVersion: 1,
      upgrades: {
        'piece-1': { '1': true, '2': true, '3': false },
        'piece-2': { '1': true, '3': true }
      },
      inventory: { 'mat-a': 5 },
      ui: { openCats: ['head'], openPieces: ['piece-1'] },
      lastUpdated: '2023-01-01T00:00:00.000Z'
    });

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.levels).toEqual({ 'piece-1': 2, 'piece-2': 1 });
    expect(migrated.inventory['mat-a']).toBe(5);
    expect(migrated.ui).toEqual({ openCats: ['head'], openPieces: ['piece-1'] });
    expect(migrated.lastUpdated).toBe('2023-01-01T00:00:00.000Z');
  });

  it('fills in missing ids and ui defaults', () => {
    const state = {
      schemaVersion: 2,
      levels: { 'piece-1': 1 },
      inventory: {},
      ui: {}
    };

    ensureStateAligned(SAMPLE_DATA, state);

    expect(state.levels).toEqual({ 'piece-1': 1, 'piece-2': 0 });
    expect(state.inventory).toEqual({ 'mat-a': 0, 'mat-b': 0 });
    expect(state.ui).toEqual({ openCats: [], openPieces: [] });
  });
});

describe('upgrade calculations', () => {
  let state;

  beforeEach(() => {
    state = {
      schemaVersion: 2,
      levels: { 'piece-1': 1, 'piece-2': 2 },
      inventory: { 'mat-a': 1, 'mat-b': 2 },
      ui: { openCats: [], openPieces: [] }
    };

  });

  it('summarizes remaining upgrade requirements', () => {
    const remaining = sumRemainingRequirements(SAMPLE_DATA, state);
    expect(remaining.get('mat-a')).toBe(3);
    expect(remaining.get('mat-b')).toBe(7);
  });

  it('computes aggregate counts', () => {
    const summary = counts(SAMPLE_DATA, state);
    expect(summary.completedLevels).toBe(3);
    expect(summary.totalLevels).toBe(8);
    expect(summary.remainingReq.get('mat-b')).toBe(7);
  });

  it('clamps level inputs to safe numbers', () => {
    expect(clampInt('12abc')).toBe(12);
    expect(clampInt(-4)).toBe(0);
    expect(clampInt('100000')).toBe(99999);
    expect(clampInt(null)).toBe(0);
  });
});
