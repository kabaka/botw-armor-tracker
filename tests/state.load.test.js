import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LS_DATA,
  LS_STATE,
  initializeState,
  loadArmorData
} from '../src/state.js';

const SAMPLE_DATA = {
  schemaVersion: 1,
  game: 'Breath of the Wild',
  materials: [
    { id: 'mat-a', name: 'Amber' }
  ],
  armorPieces: [
    {
      id: 'piece-1',
      name: 'Test Helm',
      slot: 'head',
      materialsByLevel: {
        '1': [{ material: 'Amber', qty: 1 }],
        '2': [{ material: 'Amber', qty: 2 }],
        '3': [{ material: 'Amber', qty: 3 }],
        '4': [{ material: 'Amber', qty: 4 }]
      }
    }
  ]
};

const SAMPLE_SOURCES = { 'piece-1': { where: 'Test' } };

function createMemoryStorage(initial = {}){
  const store = { ...initial };
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    }
  };
}

describe('loadArmorData', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn(async (url) => {
      const payload = url.includes('sources') ? SAMPLE_SOURCES : SAMPLE_DATA;
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefers cached armor data but still fetches sources', async () => {
    const storage = createMemoryStorage({ [LS_DATA]: JSON.stringify(SAMPLE_DATA) });
    const result = await loadArmorData({ dataPath: '/data.json', sourcesPath: '/sources.json', storage });

    expect(result.data.armorPieces).toHaveLength(1);
    expect(result.sources).toEqual(SAMPLE_SOURCES);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/sources.json', { cache: 'no-store' });
  });

  it('fetches and caches armor data when missing', async () => {
    const storage = createMemoryStorage();
    const result = await loadArmorData({ dataPath: '/data.json', sourcesPath: '/sources.json', storage });

    expect(result.data).toEqual(SAMPLE_DATA);
    expect(JSON.parse(storage.getItem(LS_DATA))).toEqual(SAMPLE_DATA);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('initializeState', () => {
  it('builds a fresh state and persists it', () => {
    const storage = createMemoryStorage();
    const state = initializeState(SAMPLE_DATA, { storage });

    expect(state.levels).toEqual({ 'piece-1': 0 });
    expect(JSON.parse(storage.getItem(LS_STATE)).levels).toEqual({ 'piece-1': 0 });
  });

  it('migrates and realigns stored state', () => {
    const storage = createMemoryStorage({
      [LS_STATE]: JSON.stringify({
        schemaVersion: 1,
        upgrades: { 'piece-1': { '1': true } },
        inventory: {}
      })
    });

    const state = initializeState(SAMPLE_DATA, { storage });
    expect(state.schemaVersion).toBe(2);
    expect(state.levels['piece-1']).toBe(1);
  });
});
