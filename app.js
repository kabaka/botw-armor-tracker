import { initializeState, loadArmorData } from './src/state.js';
import { initUI } from './src/ui.js';

const DATA_URL = null; // e.g. "https://example.com/botw_armor_data.json"

function getStorage(){
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

async function init(){
  const storage = getStorage();
  const { data, sources, materialSources } = await loadArmorData({ dataUrl: DATA_URL, storage });
  const state = initializeState(data, { storage });

  initUI({ data, state, sources, materialSources, storage });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  init().catch(err=>{
    console.error(err);
    alert("Failed to initialize app. Check console for details.");
  });
}
