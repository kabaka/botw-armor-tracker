const LS_DATA = "botw.data.v1";
const LS_STATE = "botw.state.v2";

const DEFAULT_DATA_PATH = "./data/botw_armor_data.json";
const DEFAULT_SOURCES_PATH = "./data/armor_sources.json";
const DEFAULT_DATA_URL = null; // optional remote dataset override

function resolveStorage(storage){
  if(storage) return storage;
  if(typeof localStorage !== "undefined") return localStorage;
  return null;
}

function loadJSONFromStorage(key, storage){
  const store = resolveStorage(storage);
  if(!store) return null;
  const raw = store.getItem(key);
  if(!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function saveJSONToStorage(key, value, storage){
  const store = resolveStorage(storage);
  if(!store) return;
  store.setItem(key, JSON.stringify(value));
}

function validateData(data){
  return !!(data
    && data.schemaVersion === 1
    && Array.isArray(data.armorPieces)
    && Array.isArray(data.materials));
}

function defaultState(data){
  const levels = {};
  const inventory = {};

  for(const p of data?.armorPieces || []){
    levels[p.id] = 0;
  }
  for(const m of data?.materials || []){
    inventory[m.id] = 0;
  }

  return {
    schemaVersion: 2,
    levels,
    inventory,
    ui: { openCats: [], openPieces: [] },
    lastUpdated: new Date().toISOString()
  };
}

function loadState(storage){
  return loadJSONFromStorage(LS_STATE, storage);
}

function saveState(state, storage){
  const next = state;
  if(next){
    next.lastUpdated = new Date().toISOString();
  }
  saveJSONToStorage(LS_STATE, next, storage);
}

function migrateOldStateIfNeeded(state){
  if(state && state.schemaVersion === 1 && state.upgrades && !state.levels){
    const levels = {};
    for(const [pid, obj] of Object.entries(state.upgrades)){
      let lvl = 0;
      for(let i=1;i<=4;i++){
        if(obj && obj[String(i)]) lvl = i;
        else break;
      }
      levels[pid] = lvl;
    }
    return {
      schemaVersion: 2,
      levels,
      inventory: state.inventory || {},
      ui: state.ui || { openCats: [], openPieces: [] },
      lastUpdated: state.lastUpdated || new Date().toISOString()
    };
  }
  return state;
}

function ensureStateAligned(data, state){
  for(const p of data.armorPieces){
    if(!(p.id in state.levels)) state.levels[p.id] = 0;
  }
  for(const m of data.materials){
    if(!(m.id in state.inventory)) state.inventory[m.id] = 0;
  }
  state.ui ||= { openCats: [], openPieces: [] };
  state.ui.openCats ||= [];
  state.ui.openPieces ||= [];
}

function clampInt(v){
  const n = Number(String(v).replace(/[^0-9-]/g,""));
  if(!Number.isFinite(n) || n < 0) return 0;
  return Math.min(99999, Math.floor(n));
}

function sumRemainingRequirements(data, state){
  const req = new Map();
  const matNameToId = new Map(data.materials.map(m => [m.name, m.id]));

  for(const p of data.armorPieces){
    const cur = clampInt(state.levels[p.id] ?? 0);
    for(const [lvlStr, items] of Object.entries(p.materialsByLevel || {})){
      const lvl = Number(lvlStr);
      if(!Number.isFinite(lvl)) continue;
      if(lvl <= cur) continue;
      for(const it of items){
        const mid = matNameToId.get(it.material);
        if(!mid) continue;
        req.set(mid, (req.get(mid) || 0) + Number(it.qty || 0));
      }
    }
  }
  return req;
}

function counts(data, state){
  const remainingReq = sumRemainingRequirements(data, state);
  const completedLevels = Object.values(state.levels).reduce((a,b)=>a+Number(b||0),0);
  const totalLevels = data.armorPieces.length * 4;
  return { remainingReq, completedLevels, totalLevels };
}

async function fetchJSON(url){
  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function loadArmorData({ dataPath = DEFAULT_DATA_PATH, sourcesPath = DEFAULT_SOURCES_PATH, dataUrl = DEFAULT_DATA_URL, storage } = {}){
  let data = loadJSONFromStorage(LS_DATA, storage);
  if(!validateData(data)) data = null;

  if(!data && dataUrl){
    try{
      const remote = await fetchJSON(dataUrl);
      if(validateData(remote)){
        data = remote;
        saveJSONToStorage(LS_DATA, data, storage);
      }
    }catch(err){
      console.warn("DATA_URL fetch failed; falling back to local file.", err);
    }
  }

  if(!data){
    data = await fetchJSON(dataPath);
    if(validateData(data)) saveJSONToStorage(LS_DATA, data, storage);
  }

  const sources = await fetchJSON(sourcesPath);

  return { data, sources };
}

function initializeState(data, { storage } = {}){
  let state = migrateOldStateIfNeeded(loadState(storage));
  if(!state) state = defaultState(data);
  ensureStateAligned(data, state);
  saveState(state, storage);
  return state;
}

export {
  LS_DATA,
  LS_STATE,
  clampInt,
  counts,
  defaultState,
  ensureStateAligned,
  initializeState,
  loadArmorData,
  loadState,
  migrateOldStateIfNeeded,
  saveState,
  sumRemainingRequirements,
  validateData
};
