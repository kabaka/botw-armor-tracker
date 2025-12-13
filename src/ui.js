import { LS_DATA, clampInt, counts, defaultState, saveState, sumRemainingRequirements } from './state.js';
import { parseBackupFile } from './backup.js';

const el = (sel, root=document) => root.querySelector(sel);
const els = (sel, root=document) => Array.from(root.querySelectorAll(sel));

let DATA;
let STATE;
let SOURCES;
let MATERIAL_SOURCES;
let STORAGE;

const MATERIALS_SORTS = ["needed", "alpha", "category"];

function initUI({ data, state, sources, materialSources, storage }){
  DATA = data;
  STATE = state;
  SOURCES = sources || {};
  MATERIAL_SOURCES = materialSources || {};
  STORAGE = storage;

  wireTabs();
  wireHeader();
  render();
}

function getStorage(){
  return STORAGE ?? (typeof localStorage !== "undefined" ? localStorage : null);
}

function persistData(data){
  const store = getStorage();
  if(!store) return;
  try{
    store.setItem(LS_DATA, JSON.stringify(data));
  }catch(err){
    console.warn("Failed to persist dataset", err);
  }
}

function persistState(){
  saveState(STATE, getStorage());
}

function ensureMaterialsUIState(hasCategoryOption = false){
  STATE.ui ||= {};
  STATE.ui.materials ||= { deficitsOnly: false, sort: "needed" };
  if(!MATERIALS_SORTS.includes(STATE.ui.materials.sort) || (!hasCategoryOption && STATE.ui.materials.sort === "category")){
    STATE.ui.materials.sort = "needed";
  }
  STATE.ui.materials.deficitsOnly = Boolean(STATE.ui.materials.deficitsOnly);
  return STATE.ui.materials;
}

function toast(msg){
  const t = el("#toast");
  t.textContent = msg;
  t.classList.add("show");
  window.clearTimeout(toast._tm);
  toast._tm = window.setTimeout(()=>t.classList.remove("show"), 2400);
}

function resetProgress(){
  STATE = defaultState(DATA);
  persistState();
  toast("Reset complete.");
  render();
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

function getMaterialLookups(){
  const nameToId = new Map(DATA.materials.map(m => [m.name, m.id]));
  return {
    nameToId,
    idToName: new Map(DATA.materials.map(m => [m.id, m.name])),
    byId: new Map(DATA.materials.map(m => [m.id, m])),
    resolveId: (material) => nameToId.get(material) || material
  };
}

function getLevelRequirements(pieceId, level){
  const piece = DATA.armorPieces.find(p => p.id === pieceId);
  if(!piece || !piece.materialsByLevel) return [];
  const mats = piece.materialsByLevel[level];
  if(!Array.isArray(mats)) return [];
  const lookups = getMaterialLookups();
  return mats
    .map((m)=>({ mid: lookups.resolveId(m.material), qty: Number(m.qty || m.quantity || 0) }))
    .filter(({ mid, qty }) => mid && Number.isFinite(qty) && qty > 0);
}

function attemptQuickUpgrade(pieceId, level){
  const requirements = getLevelRequirements(pieceId, level);
  if(!requirements.length) return false;

  const currentLevel = clampInt(STATE.levels[pieceId] ?? 0);
  if(level <= currentLevel) return false;

  const missing = requirements.find(({ mid, qty }) => Number(STATE.inventory[mid] || 0) < qty);
  if(missing) return false;

  for(const { mid, qty } of requirements){
    const current = Number(STATE.inventory[mid] || 0);
    STATE.inventory[mid] = Math.max(0, current - qty);
  }

  const piece = DATA.armorPieces.find(p => p.id === pieceId);
  STATE.levels[pieceId] = level;
  persistState();
  toast(`${escapeHtml(piece?.name || pieceId)} upgraded to Lv${level}.`);
  return true;
}

function preserveOpenState(){
  const openCats = new Set();
  const openPieces = new Set();
  for(const acc of els(".accordion")){
    if(acc.classList.contains("open")){
      openCats.add(acc.dataset.cat);
      for(const piece of els(".piece", acc)){
        if(piece.dataset.open === "1") openPieces.add(piece.dataset.piece);
      }
    }
  }
  STATE.ui.openPieces = Array.from(openPieces);
  STATE.ui.openCats = Array.from(openCats);
  persistState();
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
  const { remainingReq, completedLevels, totalLevels } = counts(DATA, STATE);
  const remainingItems = Array.from(remainingReq.entries())
    .map(([mid,qty]) => ({ mid, qty }))
    .sort((a,b)=>b.qty-a.qty);

  const deficitCount = remainingItems.filter(({mid,qty}) => (STATE.inventory[mid]||0) < qty).length;

  const view = el("#view-summary");
  view.innerHTML = `
    <div class="grid cols-2">
      <div class="card">
        <h3>Progress</h3>
        <div class="muted tiny">Upgrade levels across all armor pieces (0–4 per piece)</div>
        <div class="kpis">
          <div class="kpi">
            <div class="label">Completed upgrade levels</div>
            <div class="value">${completedLevels}</div>
          </div>
          <div class="kpi">
            <div class="label">Total upgrade levels</div>
            <div class="value">${totalLevels}</div>
          </div>
          <div class="kpi">
            <div class="label">Remaining upgrade levels</div>
            <div class="value">${Math.max(0, totalLevels - completedLevels)}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>Materials health</h3>
        <div class="muted tiny">Deficits vs remaining upgrades</div>
        <div class="muted tiny">Materials in deficit = unique materials still needed</div>
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
      <h3 style="margin:0">Top remaining materials</h3>
      <div class="muted tiny">Based on current armor levels (0–4)</div>

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

  view.innerHTML = `
    <div class="search">
      <input id="armorSearch" placeholder="Search armor pieces or sets…" />
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

  restoreOpenState(root);

  root.addEventListener("click", (e)=>{
    const t = e.target;
    if(!(t instanceof HTMLElement)) return;

    const quickUpgradeBtn = t.closest("button[data-kind='quickUpgrade']");
    if(quickUpgradeBtn){
      const pid = quickUpgradeBtn.dataset.piece;
      const lvl = clampInt(quickUpgradeBtn.dataset.level);
      if(attemptQuickUpgrade(pid, lvl)){
        preserveOpenState();
        render();
      }
      return;
    }

    const stepBtn = t.closest("button.step[data-mid]");
    if(stepBtn){
      const mid = stepBtn.dataset.mid;
      const cur = Number(STATE.inventory[mid] || 0);
      const next = stepBtn.dataset.kind === "inc" ? cur + 1 : Math.max(0, cur - 1);
      STATE.inventory[mid] = next;
      persistState();
      preserveOpenState();
      render();
      return;
    }

    const showAllToggle = t.closest("button[data-kind='toggleAllLevels']");
    if(showAllToggle){
      STATE.ui.showAllLevels = !STATE.ui.showAllLevels;
      persistState();
      preserveOpenState();
      render();
      return;
    }

    const lvlBtn = t.closest("button[data-kind='setLvl']");
    if(lvlBtn){
      const pid = lvlBtn.dataset.piece;
      const lvl = clampInt(lvlBtn.dataset.lvl);
      STATE.levels[pid] = Math.max(0, Math.min(4, lvl));
      persistState();

      const group = root.querySelector(`[data-levelgroup='${pid}']`);
      if(group){
        for(const b of els("button[data-kind='setLvl']", group)){
          b.classList.toggle("active", b.dataset.lvl === String(lvl));
        }
        const pill = group.querySelector("[data-kind='lvlPill']");
        if(pill){
          pill.textContent = renderLevelStars(lvl);
          pill.setAttribute("aria-label", `Level ${lvl}`);
        }
      }

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
    persistState();
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

function renderLevelStars(level){
  const maxStars = 4;
  const safeLevel = Math.max(0, Math.min(maxStars, Number(level) || 0));
  return Array.from({ length: maxStars }, (_, i) => (i < safeLevel ? "★" : "☆")).join(" ");
}

function renderPiece(p){
  const lvl = clampInt(STATE.levels[p.id] ?? 0);
  const pillClass = lvl===4 ? "ok" : (lvl===0 ? "bad" : "warn");
  const showAllLevels = Boolean(STATE.ui?.showAllLevels);
  const pursuedLevel = lvl >= 4 ? null : lvl + 1;

  const src = SOURCES[p.id];
  const srcRegions = src?.regions?.length ? src.regions.join(" • ") : "";
  const srcWhere = src?.where || "";
  const srcCoords = src?.coords || "";
  const srcUrl = sanitizeUrl(src?.url);
  const srcHtml = (srcRegions || srcWhere || srcCoords) ? `
    <div class="tiny muted armor-src">
      ${srcRegions ? `<span class="pill mini">${escapeHtml(srcRegions)}</span>` : ``}
      ${srcWhere ? `<span>${escapeHtml(srcWhere)}</span>` : ``}
      ${srcCoords ? `<span class="muted">(${escapeHtml(srcCoords)})</span>` : ``}
      ${srcUrl ? `<a class="muted" target="_blank" rel="noreferrer" href="${escapeHtml(srcUrl)}">(More info)</a>` : ``}
    </div>
  ` : ``;

  const materials = [];
  const lookups = getMaterialLookups();
  const materialsByLevel = new Map();

  for(const [lvlStr, arr] of Object.entries(p.materialsByLevel || {})){
    const lid = Number(lvlStr);
    for(const obj of arr){
      const material = {
        lvl: lid,
        id: lookups.resolveId(obj.material),
        name: lookups.idToName.get(lookups.resolveId(obj.material)) || obj.material,
        qty: Number(obj.qty || obj.quantity || 0)
      };
      materials.push(material);
      if(!materialsByLevel.has(lid)) materialsByLevel.set(lid, []);
      materialsByLevel.get(lid).push(material);
    }
  }

  const levelStates = new Map();
  for(const [level, mats] of materialsByLevel.entries()){
    const done = lvl >= level;
    const ready = !done && mats.every(m => (Number(STATE.inventory[m.id] || 0) >= m.qty));
    levelStates.set(level, { done, ready });
  }

  const levelButtonsHtml = `
    <div class="btn-group level-buttons" data-levelgroup="${p.id}">
      ${[0,1,2,3,4].map(i=>`<button data-kind="setLvl" data-piece="${p.id}" data-lvl="${i}" class="${lvl===i ? "active" : ""}">Lv${i}</button>`).join("")}
    </div>
  `;

  const showAllToggle = materialsByLevel.size > 1
    ? `<button type="button" class="show-levels-toggle ${showAllLevels ? "active" : ""}" data-kind="toggleAllLevels" aria-pressed="${showAllLevels}">Show all levels</button>`
    : "";

  const visibleLevels = showAllLevels
    ? Array.from(materialsByLevel.keys()).sort((a,b)=>a-b)
    : (pursuedLevel ? [pursuedLevel] : []);

  const controlsHtml = `<div class="level-controls row between">${levelButtonsHtml}${showAllToggle}</div>`;

  let materialsHtml = "";
  if(visibleLevels.length){
    const tableHead = showAllLevels ? `
      <thead>
        <tr><th>Level</th><th>Materials</th></tr>
      </thead>` : "";

    materialsHtml = `
      <table class="table lvl-table">
        ${tableHead}
        ${visibleLevels.map(level => {
          const mats = [...(materialsByLevel.get(level) || [])];
          const { done, ready } = levelStates.get(level) || {};
          const statusLabel = (done || ready)
            ? `<span class="badge ok level-status"><b>HAVE</b></span>`
            : `<span class="badge bad level-status"><b>NEED</b></span>`;
          const statusHint = done
            ? `<span class="muted tiny">Completed</span>`
            : (ready
              ? `<button type="button" class="ready-upgrade" data-kind="quickUpgrade" data-piece="${p.id}" data-level="${level}">Ready to upgrade</button>`
              : `<span class="muted tiny">Missing materials</span>`);
          const donePill = done ? `<span class="pill ok mini">Done</span>` : "";

          const materialRows = mats.map(m => {
            const inv = Number(STATE.inventory[m.id] || 0);
            const diff = inv - m.qty;
            const material = lookups.byId.get(m.id);
            const acquisition = renderMaterialAcquisitionInline(material);
            let badge = "";
            if(diff < 0){
              badge = `<span class="badge bad"><b>NEED</b> <span>${-diff}</span></span>`;
            }else if(diff === 0){
              badge = `<span class="badge ok"><b>HAVE</b></span>`;
            }else{
              badge = `<span class="badge ok over"><b>OVER</b> <span>+${diff}</span></span>`;
            }

            return `
              <tr class="mat-row">
                <td>
                  <div class="mat-line">
                    <span class="mat-qty">${m.qty}×</span>
                    <b class="mat-name">${escapeHtml(m.name)}</b>
                  </div>
                  ${acquisition ? `<div class="mat-meta">${acquisition}</div>` : ""}
                </td>
                <td>
                  <div class="inv-inline armor-mat-row">
                    <div class="tiny muted" aria-hidden="true">Inventory</div>
                    ${renderInvStepper(m.id, inv)}
                    ${badge}
                  </div>
                </td>
              </tr>`;
          }).join("");

          return `
            <tbody class="level-block">
              <tr class="lvl-head-row">
                <td colspan="2">
                  <div class="level-head row between">
                    <div class="level-label">Lv${level} ${donePill}</div>
                    <div class="level-status-wrap">${statusLabel}${statusHint}</div>
                  </div>
                </td>
              </tr>
              ${materialRows}
            </tbody>`;
        }).join("")}
      </table>
    `;
  }else if(materials.length){
    const note = pursuedLevel === null
      ? "Fully upgraded."
      : "No material requirements for the selected level.";
    const toggleHint = showAllToggle && !showAllLevels ? " Enable \"Show all levels\" to review past upgrades." : "";
    materialsHtml = `<div class="muted tiny level-note">${note}${toggleHint}</div>`;
  }

  const searchText = [p.name, p.setName, p.setCategory, p.slot, (p.tags||[]).join(" ")]
    .filter(Boolean).join(" ").toLowerCase();

  return `
    <div class="piece" data-piece="${p.id}" data-search="${escapeHtml(searchText)}">
      <div class="row between">
        <div>
          <div class="muted tiny">${escapeHtml(p.slot || "")}</div>
          <div class="title">${escapeHtml(p.name)}</div>
          ${p.setName ? `<div class="muted">${escapeHtml(p.setName)}</div>` : ""}
          ${srcHtml}
        </div>
        <div class="level-stars ${pillClass}" data-kind="lvlPill" data-piece="${p.id}" aria-label="Level ${lvl}">${renderLevelStars(lvl)}</div>
      </div>

      ${p.effect ? `<div class="muted tiny">${escapeHtml(p.effect)}</div>` : ""}
      <div class="muted tiny">${escapeHtml(p.description || "")}</div>

      ${controlsHtml}

      ${materialsHtml}
    </div>
  `;
}

function getMaterialAcquisition(material){
  const src = (MATERIAL_SOURCES && MATERIAL_SOURCES[material?.id]) || {};
  const where = src.where || src.location || material?.howToGet || "";
  const coords = src.coords || "";
  const notes = src.notes || material?.notes || "";
  return { where, coords, notes };
}

function renderMaterialAcquisition(material){
  const { where, coords, notes } = getMaterialAcquisition(material);
  const parts = [];
  if(where) parts.push(`<div>${escapeHtml(where)}</div>`);
  if(coords) parts.push(`<div class="muted tiny">${escapeHtml(coords)}</div>`);
  if(notes) parts.push(`<div class="muted tiny">${escapeHtml(notes)}</div>`);

  return {
    html: parts.length ? `<div class="mat-info muted tiny">${parts.join(" ")}</div>` : "",
    searchText: [where, coords, notes].filter(Boolean).join(" ")
  };
}

function renderMaterialAcquisitionInline(material){
  const { where, coords, notes } = getMaterialAcquisition(material);
  const text = [where, notes].filter(Boolean).join(" • ");
  if(!text && !coords) return "";
  const coordsHtml = coords ? ` <span class="muted">(${escapeHtml(coords)})</span>` : "";
  return `<span class="mat-acq-inline tiny muted">${escapeHtml(text)}${coordsHtml}</span>`;
}

function renderMaterials(){
  const view = el("#view-materials");
  const hasCategoryOption = DATA.materials.some(m => !!m.category);
  const matUI = ensureMaterialsUIState(hasCategoryOption);

  view.innerHTML = `
    <div class="materials-toolbar">
      <div class="search" style="margin-bottom:0">
        <input id="matSearch" placeholder="Search materials…" />
      </div>
      <div class="mat-view-controls">
        <label class="tiny muted mat-toggle">
          <input type="checkbox" id="matDeficitsOnly" ${matUI.deficitsOnly ? "checked" : ""} />
          Deficits only
        </label>
        <label class="tiny muted mat-sort">
          Sort
          <select id="matSort">
            <option value="needed">Most needed</option>
            <option value="alpha">A–Z</option>
            ${hasCategoryOption ? `<option value="category">Category</option>` : ""}
          </select>
        </label>
      </div>
    </div>

    <div class="card">
      <h3 style="margin:0">Materials & inventory</h3>
      <div class="muted tiny">Totals shown against remaining upgrades (above current levels)</div>

      <div style="margin-top:12px; overflow:auto">
        <table class="table" id="matTable">
          <thead>
            <tr><th>Material</th><th>Remaining</th><th>Inventory</th><th>Status</th></tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  `;

  const tbl = el("#matTable");
  const tbody = tbl.querySelector("tbody");
  const search = el("#matSearch");
  const deficitsToggle = el("#matDeficitsOnly");
  const sortSelect = el("#matSort");

  if(sortSelect){
    const validSort = matUI.sort && Array.from(sortSelect.options).some(o => o.value === matUI.sort);
    sortSelect.value = validSort ? matUI.sort : "needed";
  }

  function renderTable(){
    const remainingReq = sumRemainingRequirements(DATA, STATE);
    const settings = ensureMaterialsUIState(hasCategoryOption);
    if(sortSelect && sortSelect.value !== settings.sort){
      settings.sort = MATERIALS_SORTS.includes(sortSelect.value) ? sortSelect.value : "needed";
    }
    const q = search?.value.trim().toLowerCase() || "";

    const rows = DATA.materials
      .map(m => {
        const rem = Number(remainingReq.get(m.id) || 0);
        const inv = Number(STATE.inventory[m.id] || 0);
        const diff = inv - rem;
        const needed = Math.max(0, rem - inv);
        const badge = diff >= 0
          ? `<span class="badge ok"><b>OK</b> <span>+${diff}</span></span>`
          : `<span class="badge bad"><b>NEED</b> <span>${-diff}</span></span>`;
        const acquisition = renderMaterialAcquisition(m);
        const searchText = (m.tags || []).concat([m.name, acquisition.searchText]).join(" ").toLowerCase();
        return { m, rem, inv, needed, badge, acquisition, searchText };
      })
      .filter(({ needed, searchText }) => {
        if(settings.deficitsOnly && needed <= 0) return false;
        if(q && !searchText.includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        if(settings.sort === "alpha") return a.m.name.localeCompare(b.m.name);
        if(settings.sort === "category"){
          return (a.m.category || "").localeCompare(b.m.category || "") || a.m.name.localeCompare(b.m.name);
        }
        return b.needed - a.needed || a.m.name.localeCompare(b.m.name);
      });

    tbody.innerHTML = rows.map(({ m, rem, inv, badge, acquisition }) => `
      <tr data-mid="${m.id}">
        <td class="mat-main">
          <div class="mat-row-top">
            <div class="mat-name"><b>${escapeHtml(m.name)}</b></div>
            <span class="mat-status mat-status-mobile">${badge}</span>
          </div>
          ${acquisition.html}
        </td>
        <td class="mat-remaining">
          <div class="mat-col-label tiny muted">Remaining</div>
          <div class="mat-col-value">${rem}</div>
        </td>
        <td class="mat-inventory">
          <div class="mat-col-label tiny muted">Inventory</div>
          ${renderInvStepper(m.id, inv)}
        </td>
        <td class="mat-status mat-status-desktop">${badge}</td>
      </tr>
    `).join("");
  }

  renderTable();

  tbl.addEventListener("input", (e)=>{
    const t = e.target;
    if(!(t instanceof HTMLInputElement)) return;
    if(t.dataset.kind === "inv"){
      const mid = t.dataset.mid;
      const v = clampInt(t.value);
      t.value = String(v);
      STATE.inventory[mid] = v;
      persistState();

      renderTable();
      renderSummary();
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
    persistState();

    const input = tbl.querySelector(`input[data-kind='inv'][data-mid='${cssEscape(mid)}']`);
    if(input) input.value = String(next);

    renderTable();
    renderSummary();
  });

  search?.addEventListener("input", ()=>{
    renderTable();
  });

  deficitsToggle?.addEventListener("change", ()=>{
    const settings = ensureMaterialsUIState(hasCategoryOption);
    settings.deficitsOnly = Boolean(deficitsToggle.checked);
    persistState();
    renderTable();
  });

  sortSelect?.addEventListener("change", ()=>{
    const settings = ensureMaterialsUIState(hasCategoryOption);
    settings.sort = MATERIALS_SORTS.includes(sortSelect.value) ? sortSelect.value : "needed";
    sortSelect.value = settings.sort;
    persistState();
    renderTable();
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
        <h3>Saving & backups</h3>
        <p class="muted">
          Your armor levels and material counts live entirely on this device (in your browser’s storage). There are no accounts or cloud sync, so clearing site data will remove your progress here.
        </p>
        <p class="muted">
          Use the <b>Export</b> button in the header to download a backup file that includes your saved progress and the dataset. Keep it somewhere safe if you plan to switch browsers or clear storage. The <b>Import</b> button restores one of those backups on this device.
        </p>
        <p class="muted tiny">Tip: the exported JSON is a readable snapshot of your current armor levels and inventory totals.</p>
      </div>
    </div>

    <div class="card" style="margin-top:12px">
      <h3>How upgrade totals are calculated</h3>
      <ul class="muted">
        <li><b>Levels 0–4:</b> set the level you have already upgraded to. Level 0 means unupgraded; level 4 is maxed out.</li>
        <li><b>Remaining materials:</b> the materials list sums every upgrade cost above your current level for each piece.</li>
        <li><b>Inventory check:</b> your recorded inventory is subtracted from those totals, showing what you still need to gather.</li>
      </ul>
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

function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function cssEscape(str){
  return String(str).replace(/\\/g,"\\\\").replace(/'/g,"\\'").replace(/"/g,'\\"');
}

function sanitizeUrl(url){
  if(!url) return "";
  try {
    const base = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "http://localhost";
    const parsed = new URL(String(url), base);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") ? parsed.href : "";
  } catch {
    return "";
  }
}

async function applyBackupFile(file){
  const { data, state } = await parseBackupFile(file);
  DATA = data;
  STATE = state;
  persistData(DATA);
  persistState();
  render();
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

function wireImportDialog(){
  const dialog = el("#importDialog");
  const dropzone = el("#importDropzone");
  const fileInput = el("#importFile");
  const cancelBtn = el("#importCancel");

  if(!dialog || !dropzone || !fileInput){
    return () => {};
  }

  if(typeof dialog.showModal !== "function"){
    dialog.showModal = () => dialog.setAttribute("open", "true");
    dialog.close = () => dialog.removeAttribute("open");
  }

  let busy = false;

  const resetFileInput = () => { fileInput.value = ""; dropzone.classList.remove("dragging"); };
  const closeDialog = () => {
    dialog.close();
    resetFileInput();
  };
  const openDialog = () => {
    dialog.showModal();
    window.queueMicrotask(()=>{
      dropzone.focus();
    });
  };

  async function handleFiles(files){
    if(busy || !files || files.length === 0) return;
    busy = true;
    try{
      await applyBackupFile(files[0]);
      toast("Imported backup.");
      closeDialog();
    }catch(err){
      console.error(err);
      toast(err?.message || "Import failed.");
    }finally{
      busy = false;
      resetFileInput();
    }
  }

  dropzone.addEventListener("click", ()=>fileInput.click());
  dropzone.addEventListener("keydown", (event)=>{
    if(event.key === "Enter" || event.key === " "){
      event.preventDefault();
      fileInput.click();
    }
  });
  dropzone.addEventListener("dragover", (event)=>{
    event.preventDefault();
    dropzone.classList.add("dragging");
  });
  dropzone.addEventListener("dragleave", ()=>{
    dropzone.classList.remove("dragging");
  });
  dropzone.addEventListener("drop", (event)=>{
    event.preventDefault();
    dropzone.classList.remove("dragging");
    handleFiles(event.dataTransfer?.files);
  });

  fileInput.addEventListener("change", ()=>handleFiles(fileInput.files));

  cancelBtn?.addEventListener("click", ()=>{
    closeDialog();
  });
  dialog.addEventListener("click", (event)=>{
    if(event.target === dialog) closeDialog();
  });

  return openDialog;
}

function wireResetDialog(){
  const dialog = el("#resetDialog");
  const cancelBtn = el("#resetCancel");
  const confirmBtn = el("#resetConfirm");

  if(!dialog){
    return () => {
      if(window.confirm("Reset all progress + inventory? (Dataset remains cached.)")) resetProgress();
    };
  }

  if(typeof dialog.showModal !== "function"){
    dialog.showModal = () => {
      dialog.setAttribute("open", "true");
      dialog.open = true;
    };
  }
  if(typeof dialog.close !== "function"){
    dialog.close = () => {
      dialog.removeAttribute("open");
      dialog.open = false;
    };
  }

  const closeDialog = () => dialog.close();
  const openDialog = () => {
    dialog.showModal();
    const focusTarget = el("[data-focus-default]", dialog);
    focusTarget?.focus();
  };

  cancelBtn?.addEventListener("click", closeDialog);
  dialog.addEventListener("cancel", (event)=>{
    event.preventDefault();
    closeDialog();
  });
  dialog.addEventListener("click", (event)=>{
    if(event.target === dialog) closeDialog();
  });
  confirmBtn?.addEventListener("click", ()=>{
    resetProgress();
    closeDialog();
  });

  return openDialog;
}

function wireHeader(){
  const openResetDialog = wireResetDialog();
  const openImportDialog = wireImportDialog();

  el("#btnReset").addEventListener("click", ()=>{
    openResetDialog();
  });

  el("#btnImport").addEventListener("click", ()=>{
    openImportDialog();
  });

  el("#btnExport").addEventListener("click", ()=>{
    persistState();
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
}

export {
  cssEscape,
  escapeHtml,
  sanitizeUrl,
  groupBy,
  initUI
};
