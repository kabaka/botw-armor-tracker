import { clampInt, defaultState, ensureStateAligned, migrateOldStateIfNeeded, validateData } from './state.js';

const MAX_BACKUP_SIZE_BYTES = 1024 * 1024; // 1MB ceiling for backup files
const MAX_ARMOR_PIECES = 500;
const MAX_MATERIALS = 1200;
const MAX_STRING_LENGTH = 220;
const MAX_MATERIALS_PER_LEVEL = 24;

function isSafeString(value){
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_STRING_LENGTH;
}

function assertNoPrototypePollution(obj){
  if(!obj || typeof obj !== 'object') return;
  if(Object.prototype.hasOwnProperty.call(obj, '__proto__')){
    throw new Error('Invalid backup payload.');
  }
}

function validateMaterials(materials){
  if(!Array.isArray(materials) || materials.length === 0 || materials.length > MAX_MATERIALS){
    throw new Error('Invalid materials list in backup.');
  }
  const seen = new Set();
  for(const mat of materials){
    if(!mat || typeof mat !== 'object') throw new Error('Invalid materials list in backup.');
    assertNoPrototypePollution(mat);
    if(!isSafeString(mat.id) || !isSafeString(mat.name)) throw new Error('Invalid materials list in backup.');
    if(seen.has(mat.id)) throw new Error('Duplicate material ids in backup.');
    seen.add(mat.id);
  }
  return materials;
}

function validateArmorPieces(armorPieces){
  if(!Array.isArray(armorPieces) || armorPieces.length === 0 || armorPieces.length > MAX_ARMOR_PIECES){
    throw new Error('Invalid armor list in backup.');
  }
  const seen = new Set();
  for(const piece of armorPieces){
    if(!piece || typeof piece !== 'object') throw new Error('Invalid armor list in backup.');
    assertNoPrototypePollution(piece);
    if(!isSafeString(piece.id) || !isSafeString(piece.name)) throw new Error('Invalid armor list in backup.');
    if(seen.has(piece.id)) throw new Error('Duplicate armor ids in backup.');
    seen.add(piece.id);
    if(piece.materialsByLevel && typeof piece.materialsByLevel === 'object'){
      assertNoPrototypePollution(piece.materialsByLevel);
      for(const [lvl, reqs] of Object.entries(piece.materialsByLevel)){
        const lvlNum = Number(lvl);
        if(!Number.isInteger(lvlNum) || lvlNum < 1 || lvlNum > 4) throw new Error('Invalid armor upgrade levels in backup.');
        if(!Array.isArray(reqs) || reqs.length > MAX_MATERIALS_PER_LEVEL) throw new Error('Invalid armor upgrade levels in backup.');
        for(const req of reqs){
          if(!req || typeof req !== 'object') throw new Error('Invalid armor upgrade levels in backup.');
          assertNoPrototypePollution(req);
          if(!isSafeString(req.material)) throw new Error('Invalid armor upgrade levels in backup.');
          const qty = clampInt(req.qty);
          if(qty <= 0) throw new Error('Invalid armor upgrade levels in backup.');
        }
      }
    }else{
      throw new Error('Invalid armor upgrade levels in backup.');
    }
  }
  return armorPieces;
}

function sanitizeState(data, rawState){
  const migrated = migrateOldStateIfNeeded(rawState);
  if(!migrated || migrated.schemaVersion !== 2) throw new Error('Unsupported backup version.');

  const base = defaultState(data);
  const state = {
    ...base,
    schemaVersion: 2,
    ui: {
      ...base.ui,
      ...(migrated.ui || {}),
      materials: { ...base.ui.materials, ...(migrated.ui?.materials || {}) }
    },
    lastUpdated: isSafeString(migrated.lastUpdated) && !Number.isNaN(Date.parse(migrated.lastUpdated))
      ? migrated.lastUpdated
      : base.lastUpdated
  };

  for(const piece of data.armorPieces){
    state.levels[piece.id] = Math.min(4, clampInt(migrated.levels?.[piece.id] ?? 0));
  }
  for(const mat of data.materials){
    state.inventory[mat.id] = clampInt(migrated.inventory?.[mat.id] ?? 0);
  }

  ensureStateAligned(data, state);
  return state;
}

function parseBackupContent(text, { maxSizeBytes = MAX_BACKUP_SIZE_BYTES } = {}){
  if(typeof text !== 'string' || text.length === 0) throw new Error('Backup file is empty.');
  if(text.length > maxSizeBytes) throw new Error('Backup file is too large.');

  let payload;
  try{
    payload = JSON.parse(text);
  }catch{
    throw new Error('Backup file is not valid JSON.');
  }

  if(!payload || typeof payload !== 'object' || Array.isArray(payload)){
    throw new Error('Backup file is malformed.');
  }
  assertNoPrototypePollution(payload);
  if(!('data' in payload) || !('state' in payload)) throw new Error('Backup file is missing data or state.');

  const { data, state } = payload;
  if(!validateData(data)) throw new Error('Backup contains invalid dataset.');
  validateMaterials(data.materials);
  validateArmorPieces(data.armorPieces);

  const matNames = new Set(data.materials.map(m => m.name));
  for(const piece of data.armorPieces){
    for(const reqs of Object.values(piece.materialsByLevel || {})){
      for(const req of reqs){
        if(!matNames.has(req.material)) throw new Error('Backup references unknown materials.');
      }
    }
  }

  return { data, state: sanitizeState(data, state) };
}

async function parseBackupFile(file, opts = {}){
  if(!file) throw new Error('No file provided.');
  const maxSizeBytes = opts.maxSizeBytes ?? MAX_BACKUP_SIZE_BYTES;
  if(file.size > maxSizeBytes) throw new Error('Backup file is too large.');
  const type = (file.type || '').toLowerCase();
  if(type && type !== 'application/json' && type !== 'text/json'){
    throw new Error('Backup must be a JSON file.');
  }
  let text = '';
  if(typeof file.text === 'function'){
    text = await file.text();
  }else if(typeof file.arrayBuffer === 'function'){
    const buf = await file.arrayBuffer();
    text = new TextDecoder().decode(buf);
  }else{
    try{
      if(typeof FileReader !== 'undefined'){
        text = await new Promise((resolve, reject)=>{
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('Backup file could not be read.'));
          reader.onload = () => resolve(String(reader.result || ''));
          reader.readAsText(file);
        });
      }else{
        const blob = file instanceof Blob ? file : new Blob([file]);
        text = await new Response(blob).text();
      }
    }catch{
      throw new Error('Backup file could not be read.');
    }
  }
  return parseBackupContent(text, { maxSizeBytes });
}

export {
  MAX_BACKUP_SIZE_BYTES,
  parseBackupContent,
  parseBackupFile
};
