const LS_DATA = "botw.data.v1";
const LS_STATE = "botw.state.v2";

/**
 * Dataset loading
 * - Default: loads bundled ./botw_armor_data.json
 * - Optional: if DATA_URL is set, first-run can fetch from that URL instead.
 */
const DATA_PATH = "./botw_armor_data.json";
const DATA_URL = null; // e.g. "https://example.com/botw_armor_data.json"

const el = (sel, root=document) => root.querySelector(sel);
const els = (sel, root=document) => Array.from(root.querySelectorAll(sel));

let DATA = null;
let STATE = null;

function toast(msg){
  const t = el("#toast");
  t.textContent = msg;
  t.classList.add("show");
  window.clearTimeout(toast._tm);
  toast._tm = window.setTimeout(()=>t.classList.remove("show"), 2400);
}

function loadJSONFromLocalStorage(){
  const raw = localStorage.getItem(LS_DATA);
  if(!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
function saveJSONToLocalStorage(data){
  localStorage.setItem(LS_DATA, JSON.stringify(data));
}

function defaultState(data){
  const levels = {};
  for(const p of data.armorPieces){
    levels[p.id] = 0; // 0..4 (current upgrade level)
  }
  const inventory = {};
  for(const m of data.materials){
    inventory[m.id] = 0;
  }
  return {
    schemaVersion: 2,
    levels,
    inventory,
    ui: {
      openCats: [],
      openPieces: []
    },
    lastUpdated: new Date().toISOString()
  };
}

function loadState(){
  const raw = localStorage.getItem(LS_STATE);
  if(!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
function saveState(){
  STATE.lastUpdated = new Date().toISOString();
  localStorage.setItem(LS_STATE, JSON.stringify(STATE));
}

function validateData(data){
  return data
    && data.schemaVersion === 1
    && Array.isArray(data.armorPieces)
    && Array.isArray(data.materials);
}

function migrateOldStateIfNeeded(state){
  // v1 stored checkboxes per-level in STATE.upgrades[pieceId]["1".."4"].
  if(state && state.schemaVersion === 1 && state.upgrades && !state.levels){
    const levels = {};
    for(const [pid, obj] of Object.entries(state.upgrades)){
      // current level = highest checked consecutive level from 1..4
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

function ensureStateAligned(){
  for(const p of DATA.armorPieces){
    if(!(p.id in STATE.levels)) STATE.levels[p.id] = 0;
  }
  for(const m of DATA.materials){
    if(!(m.id in STATE.inventory)) STATE.inventory[m.id] = 0;
  }
  STATE.ui ||= { openCats: [], openPieces: [] };
  STATE.ui.openCats ||= [];
  STATE.ui.openPieces ||= [];
}

function sumRemainingRequirements(){
  // Remaining = costs for levels > currentLevel (0..4)
  const req = new Map(); // materialId -> qty
  const matNameToId = new Map(DATA.materials.map(m => [m.name, m.id]));

  for(const p of DATA.armorPieces){
    const cur = clampInt(STATE.levels[p.id] ?? 0);
    for(const [lvlStr, items] of Object.entries(p.materialsByLevel || {})){
      const lvl = Number(lvlStr);
      if(!Number.isFinite(lvl)) continue;
      if(lvl <= cur) continue; // already paid
      for(const it of items){
        const mid = matNameToId.get(it.material);
        if(!mid) continue;
        req.set(mid, (req.get(mid) || 0) + Number(it.qty || 0));
      }
    }
  }
  return req;
}

function counts(){
  const remainingReq = sumRemainingRequirements();
  const completedLevels = Object.values(STATE.levels).reduce((a,b)=>a+Number(b||0),0);
  const totalLevels = DATA.armorPieces.length * 4;
  return { remainingReq, completedLevels, totalLevels };
}


function renderInvStepper(mid, value){
  return `
    <div class="stepper">
      <button class="step" data-kind="dec" data-mid="${mid}" aria-label="Decrement">−</button>
      <input inputmode="numeric" pattern="[0-9]*" data-kind="inv" data-mid="${mid}" value="${value}" />
      <button class="step" data-kind="inc" data-mid="${mid}" aria-label="Increment">+</button>
    </div>
  `;
}



/** Armor acquisition info (curated per-piece) */
const ARMOR_SOURCES = {
  "champions-tunic": {
    "regions": [
      "Kakariko Village (Dueling Peaks)"
    ],
    "where": "Given by Impa during the main quest 'Captured Memories'."
  },
  "sand-boots": {
    "regions": [
      "Gerudo Desert",
      "Gerudo Town / Kara Kara Bazaar"
    ],
    "where": "Earned via Bozai side quests (then can be repurchased from Grant\u00e9 if sold)."
  },
  "snow-boots": {
    "regions": [
      "Gerudo Desert",
      "Gerudo Town / Kara Kara Bazaar"
    ],
    "where": "Earned via Bozai side quests (then can be repurchased from Grant\u00e9 if sold)."
  },
  "ancient-helm": {
    "regions": [
      "Akkala (Akkala Ancient Tech Lab)"
    ],
    "where": "Purchase from the Akkala Ancient Tech Lab after 'Robbie's Research' (requires Ancient materials)."
  },
  "ancient-cuirass": {
    "regions": [
      "Akkala (Akkala Ancient Tech Lab)"
    ],
    "where": "Purchase from the Akkala Ancient Tech Lab after 'Robbie's Research' (requires Ancient materials)."
  },
  "ancient-greaves": {
    "regions": [
      "Akkala (Akkala Ancient Tech Lab)"
    ],
    "where": "Purchase from the Akkala Ancient Tech Lab after 'Robbie's Research' (requires Ancient materials)."
  },
  "barbarian-helm": {
    "regions": [
      "Labyrinths (Hebra / Akkala / Gerudo Highlands)"
    ],
    "where": "Found in chests inside the three Lomei Labyrinth shrine-quests (one piece per labyrinth)."
  },
  "barbarian-armor": {
    "regions": [
      "Labyrinths (Hebra / Akkala / Gerudo Highlands)"
    ],
    "where": "Found in chests inside the three Lomei Labyrinth shrine-quests (one piece per labyrinth)."
  },
  "barbarian-leg-wraps": {
    "regions": [
      "Labyrinths (Hebra / Akkala / Gerudo Highlands)"
    ],
    "where": "Found in chests inside the three Lomei Labyrinth shrine-quests (one piece per labyrinth)."
  },
  "climbers-bandanna": {
    "regions": [
      "Dueling Peaks"
    ],
    "where": "Chest in Ree Dahee Shrine (Dueling Peaks)."
  },
  "climbing-gear": {
    "regions": [
      "Hateno Bay / Tenoko Island"
    ],
    "where": "Chest in Chaas Qeta Shrine (Tenoko Island, off Hateno Bay)."
  },
  "climbing-boots": {
    "regions": [
      "Lanayru Range (Mount Lanayru)"
    ],
    "where": "Chest in Tahno O'ah Shrine (Mount Lanayru)."
  },
  "desert-voe-headband": {
    "regions": [
      "Gerudo Desert (Gerudo Town)"
    ],
    "where": "Sold by the Gerudo Secret Club in Gerudo Town."
  },
  "desert-voe-spaulder": {
    "regions": [
      "Gerudo Desert (Gerudo Town)"
    ],
    "where": "Sold by the Gerudo Secret Club in Gerudo Town."
  },
  "desert-voe-trousers": {
    "regions": [
      "Gerudo Desert (Gerudo Town)"
    ],
    "where": "Sold by the Gerudo Secret Club in Gerudo Town."
  },
  "flamebreaker-helm": {
    "regions": [
      "Eldin (Goron City)"
    ],
    "where": "Sold in Goron City; the torso piece is also given during 'Fireproof Lizard Roundup'."
  },
  "flamebreaker-armor": {
    "regions": [
      "Eldin (Goron City)"
    ],
    "where": "Sold in Goron City; the torso piece is also given during 'Fireproof Lizard Roundup'."
  },
  "flamebreaker-boots": {
    "regions": [
      "Eldin (Goron City)"
    ],
    "where": "Sold in Goron City; the torso piece is also given during 'Fireproof Lizard Roundup'."
  },
  "hylian-hood": {
    "regions": [
      "Hateno Village"
    ],
    "where": "Sold in Hateno Village's armor shop."
  },
  "hylian-tunic": {
    "regions": [
      "Hateno Village"
    ],
    "where": "Sold in Hateno Village's armor shop."
  },
  "hylian-trousers": {
    "regions": [
      "Hateno Village"
    ],
    "where": "Sold in Hateno Village's armor shop."
  },
  "radiant-mask": {
    "regions": [
      "Gerudo Desert (Gerudo Town)"
    ],
    "where": "Sold in Gerudo Town at the Clothing Boutique (Radiant Set)."
  },
  "radiant-shirt": {
    "regions": [
      "Gerudo Desert (Gerudo Town)"
    ],
    "where": "Sold in Gerudo Town at the Clothing Boutique (Radiant Set)."
  },
  "radiant-tights": {
    "regions": [
      "Gerudo Desert (Gerudo Town)"
    ],
    "where": "Sold in Gerudo Town at the Clothing Boutique (Radiant Set)."
  },
  "stealth-mask": {
    "regions": [
      "Kakariko Village"
    ],
    "where": "Sold in Kakariko Village at Enchanted (Stealth Set)."
  },
  "stealth-chest-guard": {
    "regions": [
      "Kakariko Village"
    ],
    "where": "Sold in Kakariko Village at Enchanted (Stealth Set)."
  },
  "stealth-tights": {
    "regions": [
      "Kakariko Village"
    ],
    "where": "Sold in Kakariko Village at Enchanted (Stealth Set)."
  },
  "snowquill-headdress": {
    "regions": [
      "Hebra (Rito Village)"
    ],
    "where": "Sold in Rito Village's armor shop (Snowquill Set)."
  },
  "snowquill-tunic": {
    "regions": [
      "Hebra (Rito Village)"
    ],
    "where": "Sold in Rito Village's armor shop (Snowquill Set)."
  },
  "snowquill-trousers": {
    "regions": [
      "Hebra (Rito Village)"
    ],
    "where": "Sold in Rito Village's armor shop (Snowquill Set)."
  },
  "soldiers-helm": {
    "regions": [
      "Hateno Village"
    ],
    "where": "Sold in Hateno Village's armor shop (Soldier's Set)."
  },
  "soldiers-armor": {
    "regions": [
      "Hateno Village"
    ],
    "where": "Sold in Hateno Village's armor shop (Soldier's Set)."
  },
  "soldiers-greaves": {
    "regions": [
      "Hateno Village"
    ],
    "where": "Sold in Hateno Village's armor shop (Soldier's Set)."
  },
  "rubber-helm": {
    "regions": [
      "Faron / Thunderstorm regions"
    ],
    "where": "Found in treasure chests in specific shrines/quests tied to thunderstorms (Rubber Set)."
  },
  "rubber-armor": {
    "regions": [
      "Faron / Thunderstorm regions"
    ],
    "where": "Found in treasure chests in specific shrines/quests tied to thunderstorms (Rubber Set)."
  },
  "rubber-tights": {
    "regions": [
      "Faron / Thunderstorm regions"
    ],
    "where": "Found in treasure chests in specific shrines/quests tied to thunderstorms (Rubber Set)."
  },
  "zora-helm": {
    "regions": [
      "Lanayru (Zora's Domain)"
    ],
    "where": "Obtained through Zora's Domain story/side content (Zora Set)."
  },
  "zora-armor": {
    "regions": [
      "Lanayru (Zora's Domain)"
    ],
    "where": "Obtained through Zora's Domain story/side content (Zora Set)."
  },
  "zora-greaves": {
    "regions": [
      "Lanayru (Zora's Domain)"
    ],
    "where": "Obtained through Zora's Domain story/side content (Zora Set)."
  },
  "cap-of-the-wild": {
    "regions": [
      "Forgotten Temple (Central/North Hyrule)"
    ],
    "where": "Reward for completing all shrines: found in chests in the Forgotten Temple (Wild Set)."
  },
  "tunic-of-the-wild": {
    "regions": [
      "Forgotten Temple (Central/North Hyrule)"
    ],
    "where": "Reward for completing all shrines: found in chests in the Forgotten Temple (Wild Set)."
  },
  "trousers-of-the-wild": {
    "regions": [
      "Forgotten Temple (Central/North Hyrule)"
    ],
    "where": "Reward for completing all shrines: found in chests in the Forgotten Temple (Wild Set)."
  },
  "amber-earrings": {
    "regions": [
      "Gerudo Desert (Gerudo Town)"
    ],
    "where": "Sold at the jewelry shop in Gerudo Town (Starlight Memories)."
  },
  "diamond-circlet": {
    "regions": [
      "Gerudo Desert (Gerudo Town)"
    ],
    "where": "Sold at the jewelry shop in Gerudo Town (Starlight Memories)."
  },
  "opal-earrings": {
    "regions": [
      "Gerudo Desert (Gerudo Town)"
    ],
    "where": "Sold at the jewelry shop in Gerudo Town (Starlight Memories)."
  },
  "ruby-circlet": {
    "regions": [
      "Gerudo Desert (Gerudo Town)"
    ],
    "where": "Sold at the jewelry shop in Gerudo Town (Starlight Memories)."
  },
  "sapphire-circlet": {
    "regions": [
      "Gerudo Desert (Gerudo Town)"
    ],
    "where": "Sold at the jewelry shop in Gerudo Town (Starlight Memories)."
  },
  "topaz-earrings": {
    "regions": [
      "Gerudo Desert (Gerudo Town)"
    ],
    "where": "Sold at the jewelry shop in Gerudo Town (Starlight Memories)."
  },
  "fierce-deity-mask": {
    "regions": [
      "Amiibo"
    ],
    "where": "Exclusive to Amiibo treasure chest drops (scan the matching Zelda-series amiibo)."
  },
  "fierce-deity-armor": {
    "regions": [
      "Amiibo"
    ],
    "where": "Exclusive to Amiibo treasure chest drops (scan the matching Zelda-series amiibo)."
  },
  "fierce-deity-boots": {
    "regions": [
      "Amiibo"
    ],
    "where": "Exclusive to Amiibo treasure chest drops (scan the matching Zelda-series amiibo)."
  },
  "cap-of-the-hero": {
    "regions": [
      "Amiibo"
    ],
    "where": "Exclusive to Amiibo treasure chest drops (scan the matching Zelda-series amiibo)."
  },
  "tunic-of-the-hero": {
    "regions": [
      "Amiibo"
    ],
    "where": "Exclusive to Amiibo treasure chest drops (scan the matching Zelda-series amiibo)."
  },
  "trousers-of-the-hero": {
    "regions": [
      "Amiibo"
    ],
    "where": "Exclusive to Amiibo treasure chest drops (scan the matching Zelda-series amiibo)."
  },
  "cap-of-the-sky": {
    "regions": [
      "Amiibo"
    ],
    "where": "Exclusive to Amiibo treasure chest drops (scan the matching Zelda-series amiibo)."
  },
  "tunic-of-the-sky": {
    "regions": [
      "Amiibo"
    ],
    "where": "Exclusive to Amiibo treasure chest drops (scan the matching Zelda-series amiibo)."
  },
  "trousers-of-the-sky": {
    "regions": [
      "Amiibo"
    ],
    "where": "Exclusive to Amiibo treasure chest drops (scan the matching Zelda-series amiibo)."
  },
  "cap-of-time": {
    "regions": [
      "Amiibo"
    ],
    "where": "Exclusive to Amiibo treasure chest drops (scan the matching Zelda-series amiibo)."
  },
  "tunic-of-time": {
    "regions": [
      "Amiibo"
    ],
    "where": "Exclusive to Amiibo treasure chest drops (scan the matching Zelda-series amiibo)."
  },
  "trousers-of-time": {
    "regions": [
      "Amiibo"
    ],
    "where": "Exclusive to Amiibo treasure chest drops (scan the matching Zelda-series amiibo)."
  },
  "cap-of-twilight": {
    "regions": [
      "Amiibo"
    ],
    "where": "Exclusive to Amiibo treasure chest drops (scan the matching Zelda-series amiibo)."
  },
  "tunic-of-twilight": {
    "regions": [
      "Amiibo"
    ],
    "where": "Exclusive to Amiibo treasure chest drops (scan the matching Zelda-series amiibo)."
  },
  "trousers-of-twilight": {
    "regions": [
      "Amiibo"
    ],
    "where": "Exclusive to Amiibo treasure chest drops (scan the matching Zelda-series amiibo)."
  },
  "cap-of-the-wind": {
    "regions": [
      "Amiibo"
    ],
    "where": "Exclusive to Amiibo treasure chest drops (scan the matching Zelda-series amiibo)."
  },
  "tunic-of-the-wind": {
    "regions": [
      "Amiibo"
    ],
    "where": "Exclusive to Amiibo treasure chest drops (scan the matching Zelda-series amiibo)."
  },
  "trousers-of-the-wind": {
    "regions": [
      "Amiibo"
    ],
    "where": "Exclusive to Amiibo treasure chest drops (scan the matching Zelda-series amiibo)."
  },
  "sheiks-mask": {
    "regions": [
      "DLC (EX Treasure)"
    ],
    "where": "DLC chest (EX Treasure): Sheik's Mask \u2014 follow 'EX Treasure: Ancient Mask' quest hint."
  },
  "vah-medoh-divine-helm": {
    "regions": [
      "DLC (EX Treasure)"
    ],
    "where": "DLC chest (EX Treasure): Divine Beast Helm \u2014 follow the corresponding EX treasure quest."
  },
  "vah-naboris-divine-helm": {
    "regions": [
      "DLC (EX Treasure)"
    ],
    "where": "DLC chest (EX Treasure): Divine Beast Helm \u2014 follow the corresponding EX treasure quest."
  },
  "vah-rudania-divine-helm": {
    "regions": [
      "DLC (EX Treasure)"
    ],
    "where": "DLC chest (EX Treasure): Divine Beast Helm \u2014 follow the corresponding EX treasure quest."
  },
  "vah-ruta-divine-helm": {
    "regions": [
      "DLC (EX Treasure)"
    ],
    "where": "DLC chest (EX Treasure): Divine Beast Helm \u2014 follow the corresponding EX treasure quest."
  }
};

/** Material source info (curated, broad locations + a one-line “where”) */
const MATERIAL_SOURCES = {
  "Acorn": { regions:["Great Hyrule Forest","Central Hyrule","Necluda"], where:"Found by picking up under trees; also from squirrels and cutting trees." },
  "Amber": { regions:["Eldin","Hebra","Gerudo Highlands","Central Hyrule"], where:"Mine ore deposits (especially in mountains); common gemstone." },
  "Opal": { regions:["Lanayru","Necluda","Hebra","Central Hyrule"], where:"Mine ore deposits; common gemstone." },
  "Topaz": { regions:["Gerudo","Gerudo Highlands"], where:"Mine ore deposits in/near Gerudo region; lightning-themed gem." },
  "Ruby": { regions:["Eldin","Death Mountain"], where:"Mine ore deposits around volcanic/mountain areas; fire-themed gem." },
  "Sapphire": { regions:["Hebra","Mount Lanayru"], where:"Mine ore deposits in cold regions; ice-themed gem." },
  "Diamond": { regions:["Eldin","Gerudo Highlands","Hebra"], where:"Rare from rare ore deposits; also from Stone Talus drops." },
  "Star Fragment": { regions:["All regions"], where:"Falls from the sky at night; track the beam and collect before dawn." },

  "Ancient Screw": { regions:["Central Hyrule","Akkala"], where:"Dropped by Guardians; also found in ancient ruins/Guardian wreckage." },
  "Ancient Spring": { regions:["Central Hyrule","Akkala"], where:"Dropped by Guardians; also found in ancient ruins/Guardian wreckage." },
  "Ancient Gear": { regions:["Central Hyrule","Akkala"], where:"Dropped by Guardians; also found in ancient ruins/Guardian wreckage." },
  "Ancient Shaft": { regions:["Central Hyrule","Akkala"], where:"Rare Guardian drop; best from tougher Guardians." },
  "Ancient Core": { regions:["Central Hyrule","Akkala"], where:"Rare Guardian drop; most reliable from Guardian Stalkers/Skywatchers." },

  "Bokoblin Horn": { regions:["All regions"], where:"Dropped by Bokoblins (stronger variants drop higher-tier parts)." },
  "Bokoblin Fang": { regions:["All regions"], where:"Dropped by Bokoblins (stronger variants drop higher-tier parts)." },
  "Bokoblin Guts": { regions:["All regions"], where:"Rare drop from higher-tier Bokoblins." },
  "Moblin Horn": { regions:["All regions"], where:"Dropped by Moblins (stronger variants drop higher-tier parts)." },
  "Moblin Fang": { regions:["All regions"], where:"Dropped by Moblins (stronger variants drop higher-tier parts)." },
  "Moblin Guts": { regions:["All regions"], where:"Rare drop from higher-tier Moblins." },
  "Lizalfos Horn": { regions:["All regions"], where:"Dropped by Lizalfos (elemental types vary by region)." },
  "Lizalfos Talon": { regions:["All regions"], where:"Dropped by Lizalfos (elemental types vary by region)." },
  "Lizalfos Tail": { regions:["All regions"], where:"Dropped by Lizalfos; elemental tails drop from matching elemental Lizalfos." },
  "Yellow Lizalfos Tail": { regions:["Gerudo","Tabantha"], where:"Dropped by Electric Lizalfos (often in deserts and stormy areas)." },

  "Chuchu Jelly": { regions:["All regions"], where:"Dropped by Chuchus; can be converted by elemental exposure (fire/ice/electric)." },
  "White Chuchu Jelly": { regions:["Hebra","Mount Lanayru"], where:"Dropped by Ice Chuchus in cold regions (or convert from regular)." },
  "Yellow Chuchu Jelly": { regions:["Gerudo","Faron"], where:"Dropped by Electric Chuchus in stormy/desert areas (or convert from regular)." },

  "Keese Wing": { regions:["All regions"], where:"Dropped by Keese (often at night, caves, and ruins)." },
  "Keese Eyeball": { regions:["All regions"], where:"Dropped by Keese; higher chance from stronger swarms/variants." },
  "Ice Keese Wing": { regions:["Hebra","Mount Lanayru"], where:"Dropped by Ice Keese in cold regions." },
  "Fire Keese Wing": { regions:["Eldin"], where:"Dropped by Fire Keese near volcanic areas." },
  "Electric Keese Wing": { regions:["Faron","Gerudo"], where:"Dropped by Electric Keese in stormy areas and some deserts." },

  "Octorok Tentacle": { regions:["Lanayru","Central Hyrule","Necluda","Coast"], where:"Dropped by Octoroks near water/coasts; look for rock/water octoroks." },
  "Octo Balloon": { regions:["Lanayru","Central Hyrule","Necluda","Coast"], where:"Dropped by Octoroks; common from water/forest octoroks." },

  "Lynel Horn": { regions:["Hebra","Akkala","Faron"], where:"Dropped by Lynels; strongest variants drop best parts." },
  "Lynel Hoof": { regions:["Hebra","Akkala","Faron"], where:"Dropped by Lynels; reliable from any Lynel." },
  "Lynel Guts": { regions:["Hebra","Akkala","Faron"], where:"Rare drop from higher-tier Lynels." },

  "Blue Nightshade": { regions:["Necluda","Great Plateau"], where:"Grows in shady forest areas; common near Kakariko-region woods." },
  "Courser Bee Honey": { regions:["Necluda","Faron"], where:"Harvest from beehives on trees; shoot hive and grab quickly." },
  "Silent Shroom": { regions:["Great Hyrule Forest","Necluda"], where:"Grows in forests; often at night or in shaded areas." },
  "Sunshroom": { regions:["Great Plateau","Central Hyrule"], where:"Grows in sunny forests/fields; common early-game." },
  "Zapshroom": { regions:["Faron"], where:"Grows in thunderstorm-prone areas; common in Faron during rain/thunder." },
  "Voltfruit": { regions:["Gerudo Desert"], where:"Found on cacti in the Gerudo Desert." },
  "Warm Safflina": { regions:["Gerudo Desert","Wasteland"], where:"Desert plant; common around sand and rock outcrops." },
  "Swift Violet": { regions:["Necluda","Faron","Hebra cliffs"], where:"Grows on cliff faces; best harvested by climbing glowy violet patches." },
  "Swift Carrot": { regions:["Necluda","Kakariko","Fairy Fountains"], where:"Often near fairy fountains and around Kakariko Village." },

  "Sunset Firefly": { regions:["Necluda","Kakariko"], where:"Catches at night near Kakariko Village and forested paths." },
  "Sneaky River Snail": { regions:["Lanayru","Necluda"], where:"Found in shallow water along rivers and lakeshores." },
  "Stealthfin Fish": { regions:["Great Hyrule Forest"], where:"Found in waters around Korok Forest (Lake Saria/Lake Mekar area)." },

  "Smotherwing Butterfly": { regions:["Eldin"], where:"Caught near Death Mountain/Eldin; often around lava-side paths." },
  "Fireproof Lizard": { regions:["Eldin"], where:"Catch in Eldin (especially on rocky paths); also sold in Foothill Stable area." },

  "Dinraal's Claw": { regions:["Eldin","Tabantha"], where:"Shoot Dinraal’s claw while gliding nearby; part drops and must be collected." },
  "Dinraal's Fang": { regions:["Eldin","Tabantha"], where:"Shoot Dinraal’s mouth/teeth; fang shard drops." },
  "Farosh's Claw": { regions:["Faron"], where:"Shoot Farosh’s claw; best around lakes/bridges in Faron." },
  "Farosh's Fang": { regions:["Faron"], where:"Shoot Farosh’s mouth/teeth; fang shard drops." },
  "Naydra's Claw": { regions:["Lanayru"], where:"Shoot Naydra’s claw around Mount Lanayru." },
  "Naydra's Fang": { regions:["Lanayru"], where:"Shoot Naydra’s mouth/teeth; fang shard drops." }
};

function getMaterialSource(name){
  return MATERIAL_SOURCES[name] || { regions:["—"], where:"Commonly found across Hyrule; use the quick search link for a precise farm route." };
}

function preserveOpenState(){
  const openCats = new Set();
  for(const acc of els(".accordion")){
    if(acc.classList.contains("open")) openCats.add(acc.dataset.cat);
  }
  STATE.ui.openCats = Array.from(openCats);
  saveState();
}

function restoreOpenState(root){
  const openCats = new Set(STATE.ui.openCats || []);
  for(const acc of els(".accordion", root)){
    const cat = acc.dataset.cat;
    if(openCats.has(cat)) acc.classList.add("open");
  }
}

function render(){
  renderSummary();
  renderArmor();
  renderMaterials();
  renderAbout();
}

function renderSummary(){
  const { remainingReq, completedLevels, totalLevels } = counts();
  const remainingItems = Array.from(remainingReq.entries())
    .map(([mid,qty]) => ({ mid, qty }))
    .sort((a,b)=>b.qty-a.qty);

  const deficitCount = remainingItems.filter(({mid,qty}) => (STATE.inventory[mid]||0) < qty).length;

  const view = el("#view-summary");
  view.innerHTML = `
    <div class="grid cols-2">
      <div class="card">
        <h3>Progress</h3>
        <div class="muted tiny">Current upgrade levels across all armor</div>
        <div class="kpis">
          <div class="kpi">
            <div class="label">Completed</div>
            <div class="value">${completedLevels}</div>
          </div>
          <div class="kpi">
            <div class="label">Total</div>
            <div class="value">${totalLevels}</div>
          </div>
          <div class="kpi">
            <div class="label">Remaining</div>
            <div class="value">${Math.max(0, totalLevels - completedLevels)}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>Materials health</h3>
        <div class="muted tiny">Deficits vs remaining upgrades</div>
        <div class="kpis">
          <div class="kpi">
            <div class="label">Materials in deficit</div>
            <div class="value">${deficitCount}</div>
          </div>
          <div class="kpi">
            <div class="label">Materials OK / over</div>
            <div class="value">${DATA.materials.length - deficitCount}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:12px">
      <div class="row between">
        <div>
          <h3 style="margin:0">Top remaining materials</h3>
          <div class="muted tiny">Based on current armor levels (0–4)</div>
        </div>
        <div class="pill warn">Tap Materials to edit inventory</div>
      </div>

      <div style="margin-top:10px; overflow:auto">
        <table class="table">
          <thead>
            <tr>
              <th>Material</th>
              <th>Remaining needed</th>
              <th>Inventory</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${remainingItems.slice(0, 18).map(({mid,qty})=>{
              const m = DATA.materials.find(x=>x.id===mid);
              const have = Number(STATE.inventory[mid]||0);
              const ok = have >= qty;
              const badge = ok
                ? `<span class="badge ok"><b>OK</b> <span>+${have-qty}</span></span>`
                : `<span class="badge bad"><b>NEED</b> <span>${qty-have}</span></span>`;
              return `
                <tr>
                  <td><b>${escapeHtml(m?.name || mid)}</b></td>
                  <td>${qty}</td>
                  <td>${have}</td>
                  <td>${badge}</td>
                </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderArmor(){
  const view = el("#view-armor");
  const categories = groupBy(DATA.armorPieces, p => p.setCategory || "Unsorted");

  const { remainingReq } = counts();

  view.innerHTML = `
    <div class="search">
      <input id="armorSearch" placeholder="Search armor pieces or sets…" />
      <span class="pill">Offline-ready</span>
    </div>
    <div id="armorAccordions"></div>
  `;

  const root = el("#armorAccordions");
for(const [cat, pieces] of Array.from(categories.entries()).sort((a,b)=>a[0].localeCompare(b[0]))){
    const done = pieces.reduce((sum,p)=>sum + Number(STATE.levels[p.id]||0), 0);
    const total = pieces.length * 4;

    const acc = document.createElement("div");
    acc.className = "accordion";
    acc.dataset.cat = cat;
    acc.innerHTML = `
      <div class="acc-head" role="button" tabindex="0">
        <div>
          <div class="acc-title">${escapeHtml(cat)}</div>
          <div class="acc-sub">${done}/${total} levels completed · ${pieces.length} pieces</div>
        </div>
        <div class="pill ${done===total ? "ok":"warn"}">${done===total ? "Complete":"In progress"}</div>
      </div>
      <div class="acc-body"></div>
    `;
    root.appendChild(acc);

    const body = el(".acc-body", acc);
    body.innerHTML = pieces
      .sort((a,b)=>(a.slot||"").localeCompare(b.slot||"") || a.name.localeCompare(b.name))
      .map(p => renderPiece(p)).join("");

    const head = el(".acc-head", acc);
    head.addEventListener("click", ()=>{
      acc.classList.toggle("open");
      preserveOpenState();
    });
    head.addEventListener("keydown", (e)=>{
      if(e.key==="Enter"||e.key===" "){
        e.preventDefault();
        acc.classList.toggle("open");
        preserveOpenState();
      }
    });
  }

  // restore open state after build
  restoreOpenState(root);

  // events
  root.addEventListener("click", (e)=>{
    const t = e.target;
    if(!(t instanceof HTMLElement)) return;

    const stepBtn = t.closest("button.step[data-mid]");
    if(stepBtn){
      const mid = stepBtn.dataset.mid;
      const cur = Number(STATE.inventory[mid] || 0);
      const next = stepBtn.dataset.kind === "inc" ? cur + 1 : Math.max(0, cur - 1);
      STATE.inventory[mid] = next;
      saveState();
      preserveOpenState();
      render();
      return;
    }

    const lvlBtn = t.closest("button[data-kind='setLvl']");
    if(lvlBtn){
      const pid = lvlBtn.dataset.piece;
      const lvl = clampInt(lvlBtn.dataset.lvl);
      STATE.levels[pid] = Math.max(0, Math.min(4, lvl));
      saveState();

      // update button group UI in place
      const group = root.querySelector(`[data-levelgroup='${pid}']`);
      if(group){
        for(const b of els("button[data-kind='setLvl']", group)){
          b.classList.toggle("active", b.dataset.lvl === String(lvl));
        }
        const pill = group.querySelector("[data-kind='lvlPill']");
        if(pill) pill.textContent = `Lv${lvl}`;
      }

      // Update derived numbers without collapsing: preserve open state first, then re-render.
      // (Re-render is simplest; we restore expanded accordions + remaining panels.)
      preserveOpenState();
      render();
      return;
    }
  });

  root.addEventListener("input", (e)=>{
    const t = e.target;
    if(!(t instanceof HTMLInputElement)) return;
    if(t.dataset.kind !== "inv") return;
    const mid = t.dataset.mid;
    const val = clampInt(t.value);
    STATE.inventory[mid] = val;
    saveState();
    preserveOpenState();
    render();
  });

    const search = el("#armorSearch");
  search.addEventListener("input", ()=>{
    const q = search.value.trim().toLowerCase();
    for(const acc of Array.from(root.querySelectorAll(".accordion"))){
      let any = false;
      for(const piece of Array.from(acc.querySelectorAll(".piece"))){
        const hay = piece.dataset.search || "";
        const show = !q || hay.includes(q);
        piece.style.display = show ? "" : "none";
        if(show) any = true;
      }
      acc.style.display = any ? "" : "none";
    }
  });
}

function renderPiece(p){
  const lvl = clampInt(STATE.levels[p.id] ?? 0);
  const pillClass = lvl===4 ? "ok" : (lvl===0 ? "bad" : "warn");

  const src = ARMOR_SOURCES[p.id];
  const srcRegions = src?.regions?.length ? src.regions.join(" • ") : "";
  const srcWhere = src?.where || "";
  const srcCoords = src?.coords || "";
  const srcUrl = src?.url || "";
  const srcHtml = (srcRegions || srcWhere || srcCoords) ? `
    <div class="tiny muted armor-src">
      ${srcRegions ? `<span class="pill mini">${escapeHtml(srcRegions)}</span>` : ``}
      ${srcWhere ? `<span>${escapeHtml(srcWhere)}</span>` : ``}
      ${srcCoords ? `<span class="muted">(${escapeHtml(srcCoords)})</span>` : ``}
      ${srcUrl ? `<a class="tiny" href="${srcUrl}" target="_blank" rel="noreferrer">source</a>` : ``}
    </div>
  ` : ``;

  const remainingReq = remainingForPiece(p, lvl);
  const remainingList = remainingReq.length
    ? `<ul>${remainingReq.map(x=>{
        const have = Number(STATE.inventory[x.mid]||0);
        const ok = have >= x.qty;
        return `<li>
          <div class="row between" style="gap:10px; align-items:center">
            <div>
              ${escapeHtml(x.name)}: <b class="${ok?"have":"need"}">${x.qty}</b>
              <span class="muted tiny">(need ${x.qty}, have ${have})</span>
            </div>
            <div class="inv-inline">${renderInvStepper(x.mid, have)}</div>
          </div>
        </li>`;
      }).join("")}</ul>`
    : `<div class="muted tiny">Fully upgraded (Lv4).</div>`;

  return `
    <div class="piece" data-search="${escapeHtml((p.name+' '+p.setCategory+' '+p.slot+' '+p.origin).toLowerCase())}">
      <div class="row between">
        <div>
          <h4>${escapeHtml(p.name)}</h4>${srcHtml}
          <div class="meta">${escapeHtml(p.slot || "")} · ${escapeHtml(p.origin || "")}
            ${p.source ? ` · <a href="${p.source}" target="_blank" rel="noreferrer">source</a>` : ""}
          </div>
        </div>
        <div class="pill ${pillClass}">${lvl}/4</div>
      </div>

      <div class="levels" data-levelgroup="${p.id}">
        <span class="pill ${pillClass}" data-kind="lvlPill">Lv${lvl}</span>
        ${[0,1,2,3,4].map(x=>`
          <button class="ghost lvlbtn ${x===lvl?"active":""}" data-kind="setLvl" data-piece="${p.id}" data-lvl="${x}" aria-label="Set level ${x}">
            ${x===0?"0":`+${x}`}
          </button>
        `).join("")}
        
      </div>
      <div class="req">
        <div class="req-head">Remaining materials</div>
        ${remainingList}
        <div class="tiny muted" style="margin-top:8px">
          Quick link:
          <a href="https://www.google.com/search?q=${encodeURIComponent(p.name+' upgrade materials')}" target="_blank" rel="noreferrer">search “${escapeHtml(p.name)} upgrade materials”</a>
          ·
          <a href="https://www.google.com/search?q=${encodeURIComponent(p.name+' location')}" target="_blank" rel="noreferrer">search “${escapeHtml(p.name)} location”</a>
        </div>
      </div>
    </div>
  `;
}

function remainingForPiece(p, curLevel){
  const matNameToId = new Map(DATA.materials.map(m => [m.name, m.id]));
  const acc = new Map(); // mid -> qty
  for(const [lvlStr, items] of Object.entries(p.materialsByLevel || {})){
    const lvl = Number(lvlStr);
    if(!Number.isFinite(lvl)) continue;
    if(lvl <= curLevel) continue;
    for(const it of items){
      const mid = matNameToId.get(it.material);
      if(!mid) continue;
      acc.set(mid, (acc.get(mid) || 0) + Number(it.qty || 0));
    }
  }
  return Array.from(acc.entries())
    .map(([mid, qty])=>{
      const m = DATA.materials.find(x=>x.id===mid);
      return { mid, qty, name: m?.name || mid };
    })
    .sort((a,b)=>b.qty-a.qty || a.name.localeCompare(b.name));
}

function renderMaterials(){
  const view = el("#view-materials");
  const { remainingReq } = counts();

  // Keep stable sort by name; status updates in-place (no focus-jumps).
  const rows = DATA.materials
    .map(m=>{
      const need = remainingReq.get(m.id) || 0;
      const have = Number(STATE.inventory[m.id] || 0);
      const diff = have - need;
      const ok = diff >= 0;
      return { m, need, have, diff, ok };
    })
    .sort((a,b)=>a.m.name.localeCompare(b.m.name));

  view.innerHTML = `
    <div class="search">
      <input id="matSearch" placeholder="Search materials…" />
      <span class="pill">Inventory saved</span>
    </div>

    <div class="card">
      <div style="overflow:auto">
        <table class="table" id="matTable">
          <thead>
            <tr>
              <th style="min-width:240px">Material</th>
              <th>Remaining needed</th>
              <th class="qty">Inventory</th>
              <th>Status</th>
              <th style="min-width:340px">Where to find it</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(({m,need,have,ok,diff})=>{
              const badge = ok
                ? `<span class="badge ok"><b>OK</b> <span>+${diff}</span></span>`
                : `<span class="badge bad"><b>NEED</b> <span>${-diff}</span></span>`;
              const src = getMaterialSource(m.name);
              return `
                <tr data-search="${escapeHtml(m.name.toLowerCase())}" data-mid="${m.id}">
                  <td>
                    <b>${escapeHtml(m.name)}</b>
                    <div class="tiny muted">Quick link:
                      <a href="https://www.google.com/search?q=${encodeURIComponent("BotW " + m.name + " location")}" target="_blank" rel="noreferrer">locations</a>
                      · <a href="https://www.google.com/search?q=${encodeURIComponent("BotW " + m.name + " farming route")}" target="_blank" rel="noreferrer">farm route</a>
                    </div>
                  </td>
                  <td data-cell="need">${need}</td>
                  <td class="qty">
                    <div class="stepper">
                      <button class="step" data-kind="dec" data-mid="${m.id}" aria-label="Decrement">−</button>
                      <input inputmode="numeric" pattern="[0-9]*" data-kind="inv" data-mid="${m.id}" value="${have}" />
                      <button class="step" data-kind="inc" data-mid="${m.id}" aria-label="Increment">+</button>
                    </div>
                  </td>
                  <td data-cell="status">${badge}</td>
                  <td>
                    <div class="tiny muted" style="margin-bottom:6px">${src.regions.map(r=>`<span class="pill" style="margin-right:6px">${escapeHtml(r)}</span>`).join("")}</div>
                    <div>${escapeHtml(src.where)}</div>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  const tbl = el("#matTable");

  function updateRow(mid){
    const tr = tbl.querySelector(`tr[data-mid='${cssEscape(mid)}']`);
    if(!tr) return;
    const { remainingReq } = counts();
    const need = remainingReq.get(mid) || 0;
    const have = Number(STATE.inventory[mid] || 0);
    const diff = have - need;
    const ok = diff >= 0;
    el("[data-cell='need']", tr).textContent = String(need);
    el("[data-cell='status']", tr).innerHTML = ok
      ? `<span class="badge ok"><b>OK</b> <span>+${diff}</span></span>`
      : `<span class="badge bad"><b>NEED</b> <span>${-diff}</span></span>`;
  }

  tbl.addEventListener("input", (e)=>{
    const t = e.target;
    if(!(t instanceof HTMLInputElement)) return;
    if(t.dataset.kind === "inv"){
      const mid = t.dataset.mid;
      const v = clampInt(t.value);
      t.value = String(v);
      STATE.inventory[mid] = v;
      saveState();

      updateRow(mid);
      renderSummary(); // KPIs + top table reflect inventory now
    }
  });

  tbl.addEventListener("click", (e)=>{
    const t = e.target;
    if(!(t instanceof HTMLElement)) return;
    const btn = t.closest("button.step");
    if(!btn) return;

    const mid = btn.dataset.mid;
    const cur = Number(STATE.inventory[mid] || 0);
    const next = btn.dataset.kind === "inc" ? cur + 1 : Math.max(0, cur - 1);
    STATE.inventory[mid] = next;
    saveState();

    const input = tbl.querySelector(`input[data-kind='inv'][data-mid='${cssEscape(mid)}']`);
    if(input) input.value = String(next);

    updateRow(mid);
    renderSummary();
  });

  const search = el("#matSearch");
  search.addEventListener("input", ()=>{
    const q = search.value.trim().toLowerCase();
    for(const tr of Array.from(tbl.querySelectorAll("tbody tr"))){
      const hay = tr.dataset.search || "";
      tr.style.display = (!q || hay.includes(q)) ? "" : "none";
    }
  });
}

function renderAbout(){
  const view = el("#view-about");
  const hasSW = "serviceWorker" in navigator;
  view.innerHTML = `
    <div class="grid cols-2">
      <div class="card">
        <h3>Installable (PWA)</h3>
        <p class="muted">
          This is a Progressive Web App: it works offline after first load and saves state locally.
        </p>
        <ul class="muted">
          <li><b>iOS Safari:</b> Share → Add to Home Screen</li>
          <li><b>Android/Chrome:</b> Install button in the menu</li>
          <li><b>Desktop Chrome/Edge:</b> Install icon in the address bar</li>
        </ul>
        <div class="pill ${hasSW ? "ok" : "bad"}">${hasSW ? "Service worker supported" : "No service worker support"}</div>
      </div>

      <div class="card">
        <h3>Data loading options</h3>
        <p class="muted">
          This app loads its dataset from <span style="font-family:var(--mono)">${escapeHtml(DATA_PATH)}</span>.
          To switch to “load from URL”, edit <span style="font-family:var(--mono)">app.js</span>:
        </p>
        <pre style="white-space:pre-wrap; font-family:var(--mono); font-size:12px; color:#cfeff1; background:rgba(0,0,0,.25); border:1px solid var(--line); padding:10px 12px; border-radius:18px">
const DATA_URL = "https://example.com/botw_armor_data.json";</pre>
        <p class="muted tiny">
          First-run behavior: if local storage has <i>no</i> dataset yet, it will fetch from that URL and store it.
        </p>
      </div>
    </div>

    <div class="card" style="margin-top:12px">
      <h3>Upgrade model</h3>
      <p class="muted">
        Each armor piece has a <b>current level (0–4)</b>. Remaining material totals are computed from levels above your current level.
      </p>
    </div>
  `;
}

function groupBy(arr, fn){
  const m = new Map();
  for(const x of arr){
    const k = fn(x);
    if(!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

function clampInt(v){
  const n = Number(String(v).replace(/[^0-9-]/g,""));
  if(!Number.isFinite(n) || n < 0) return 0;
  return Math.min(99999, Math.floor(n));
}

function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function cssEscape(str){
  // basic escape for attribute selectors
  return String(str).replace(/\\/g,"\\\\").replace(/'/g,"\\'").replace(/"/g,'\\"');
}

function wireTabs(){
  els(".tab").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      els(".tab").forEach(b=>{
        b.classList.toggle("active", b===btn);
        b.setAttribute("aria-selected", b===btn ? "true" : "false");
      });
      const tab = btn.dataset.tab;
      els(".view").forEach(v=>v.classList.toggle("active", v.dataset.view === tab));
      window.scrollTo({top:0, behavior:"smooth"});
    });
  });
}

async function fetchJSON(url){
  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function init(){
  // 1) Load dataset (local storage -> URL (optional) -> bundled file)
  let data = loadJSONFromLocalStorage();
  if(!validateData(data)){
    data = null;
  }
  if(!data && DATA_URL){
    try{
      data = await fetchJSON(DATA_URL);
      if(validateData(data)) saveJSONToLocalStorage(data);
    }catch(err){
      console.warn("DATA_URL fetch failed; falling back to local file.", err);
    }
  }
  if(!data){
    data = await fetchJSON(DATA_PATH);
    saveJSONToLocalStorage(data);
  }
  DATA = data;

  // 2) Load state
  STATE = migrateOldStateIfNeeded(loadState());
  if(!STATE) STATE = defaultState(DATA);

  ensureStateAligned();
  saveState();

  // 3) Wire UI chrome
  wireTabs();

  el("#btnReset").addEventListener("click", ()=>{
    if(!confirm("Reset all progress + inventory? (Dataset remains cached.)")) return;
    STATE = defaultState(DATA);
    saveState();
    toast("Reset complete.");
    render();
  });

  el("#btnExport").addEventListener("click", ()=>{
    const blob = new Blob([JSON.stringify({ data: DATA, state: STATE }, null, 2)], { type:"application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "botw-armor-tracker-backup.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    toast("Exported backup JSON.");
  });

  // 4) Render
  render();
}

init().catch(err=>{
  console.error(err);
  alert("Failed to initialize app. Check console for details.");
});
