import { describe, expect, it } from 'vitest';
import { initUI } from '../src/ui.js';
import { LS_STATE, defaultState } from '../src/state.js';

const DATA_FIXTURE = {
  schemaVersion: 1,
  armorPieces: [
    {
      id: 'helm1',
      name: 'Hylian Helm',
      slot: 'Head',
      setName: 'Hylian',
      setCategory: 'Hylian',
      materialsByLevel: {
        1: [
          { material: 'Bokoblin Horn', qty: 2 }
        ]
      }
    },
    {
      id: 'chest1',
      name: 'Hylian Tunic',
      slot: 'Body',
      setName: 'Hylian',
      setCategory: 'Hylian',
      materialsByLevel: {
        1: [
          { material: 'Bokoblin Horn', qty: 3 }
        ]
      }
    },
    {
      id: 'boot1',
      name: 'Sand Boots',
      slot: 'Legs',
      setName: 'Gerudo',
      setCategory: 'Gerudo',
      materialsByLevel: {
        1: [
          { material: 'Molduga Guts', qty: 1 }
        ]
      }
    }
  ],
  materials: [
    { id: 'mat1', name: 'Bokoblin Horn', tags: ['horn'] },
    { id: 'mat2', name: 'Molduga Guts', tags: ['guts'] }
  ]
};

function createDOM(){
  document.body.innerHTML = `
    <div id="toast"></div>
    <button id="btnReset"></button>
    <button id="btnImport"></button>
    <button id="btnExport"></button>
    <nav class="tabs" role="tablist">
      <button class="tab active" data-tab="summary" aria-selected="true">Summary</button>
      <button class="tab" data-tab="armor" aria-selected="false">Armor</button>
      <button class="tab" data-tab="materials" aria-selected="false">Materials</button>
      <button class="tab" data-tab="about" aria-selected="false">About</button>
    </nav>
    <main>
      <section id="view-summary" class="view active" data-view="summary"></section>
      <section id="view-armor" class="view" data-view="armor"></section>
      <section id="view-materials" class="view" data-view="materials"></section>
      <section id="view-about" class="view" data-view="about"></section>
    </main>
    <dialog id="resetDialog">
      <div class="modal-card">
        <h3 id="resetTitle">Reset progress?</h3>
        <p>This will clear saved progress from this device.</p>
        <div class="reset-hint">Consider exporting a backup first.</div>
        <div class="modal-actions">
          <button id="resetCancel" type="button" data-focus-default>Cancel</button>
          <button id="resetConfirm" type="button">Reset</button>
        </div>
      </div>
    </dialog>
    <dialog id="importDialog">
      <div class="modal-card">
        <div id="importDropzone" tabindex="0"></div>
        <input id="importFile" type="file" />
        <button id="importCancel" type="button">Cancel</button>
      </div>
    </dialog>
  `;

  const dialog = document.querySelector('dialog#resetDialog');
  dialog.showModal = () => {
    dialog.setAttribute('open', 'true');
    dialog.open = true;
  };
  dialog.close = () => {
    dialog.removeAttribute('open');
    dialog.open = false;
  };

  const importDialog = document.querySelector('dialog#importDialog');
  importDialog.showModal = () => {
    importDialog.setAttribute('open', 'true');
    importDialog.open = true;
  };
  importDialog.close = () => {
    importDialog.removeAttribute('open');
    importDialog.open = false;
  };
}

function createStorage(){
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, v),
    removeItem: (k) => mem.delete(k)
  };
}

function setup({ materialSources = {}, adjustState } = {}){
  createDOM();
  const storage = createStorage();
  const state = defaultState(DATA_FIXTURE);
  if(typeof adjustState === 'function') adjustState(state);
  initUI({ data: DATA_FIXTURE, state, sources: {}, materialSources, storage });
  return { storage, state };
}

function getMaterialNames(){
  return Array.from(document.querySelectorAll('#matTable tbody tr .mat-name b')).map((el) => el.textContent);
}

describe('renderArmor DOM behaviors', () => {
  it('switches tabs and view visibility when a tab is clicked', () => {
    setup();
    const armorTab = document.querySelector('button[data-tab="armor"]');
    const summaryTab = document.querySelector('button[data-tab="summary"]');

    armorTab.click();

    expect(armorTab.classList.contains('active')).toBe(true);
    expect(summaryTab.classList.contains('active')).toBe(false);
    expect(document.querySelector('[data-view="armor"]').classList.contains('active')).toBe(true);
    expect(document.querySelector('[data-view="summary"]').classList.contains('active')).toBe(false);
    expect(armorTab.getAttribute('aria-selected')).toBe('true');
    expect(summaryTab.getAttribute('aria-selected')).toBe('false');
  });

  it('renders accessible labels for armor and materials search inputs', () => {
    setup();

    const armorLabel = document.querySelector('label[for="armorSearch"]');
    const armorSearch = document.querySelector('#armorSearch');

    expect(armorLabel).not.toBeNull();
    expect(armorLabel.textContent).toContain('Armor search');
    expect(Array.from(armorSearch.labels)).toContain(armorLabel);

    const matTab = document.querySelector('button[data-tab="materials"]');
    matTab.click();

    const materialLabel = document.querySelector('label[for="matSearch"]');
    const materialSearch = document.querySelector('#matSearch');

    expect(materialLabel).not.toBeNull();
    expect(materialLabel.textContent).toContain('Materials search');
    expect(Array.from(materialSearch.labels)).toContain(materialLabel);
  });

  it('persists accordion open state when toggled', () => {
    const { storage } = setup();
    const firstAccordion = document.querySelector('.accordion');
    const head = firstAccordion.querySelector('.acc-head');

    head.click();

    const saved = JSON.parse(storage.getItem(LS_STATE));
    expect(firstAccordion.classList.contains('open')).toBe(true);
    expect(saved.ui.openCats).toContain(firstAccordion.dataset.cat);
  });

  it('updates inventory via steppers and persists changes', () => {
    const { state, storage } = setup();
    document.querySelector('.acc-head').click();

    const inc = document.querySelector('button.step[data-mid="mat1"][data-kind="inc"]');
    inc.click();

    expect(state.inventory.mat1).toBe(1);
    const saved = JSON.parse(storage.getItem(LS_STATE));
    expect(saved.inventory.mat1).toBe(1);

    const input = document.querySelector('input[data-kind="inv"][data-mid="mat1"]');
    expect(input.value).toBe('1');
  });

  it('consumes materials and upgrades when ready button is clicked', () => {
    const { state } = setup();
    document.querySelector('.acc-head').click();

    const inc = document.querySelector('button.step[data-mid="mat1"][data-kind="inc"]');
    inc.click();
    inc.click();

    const readyBtn = document.querySelector('button[data-kind="quickUpgrade"][data-piece="helm1"][data-level="1"]');
    expect(readyBtn).not.toBeNull();

    readyBtn.click();

    expect(state.levels.helm1).toBe(1);
    expect(state.inventory.mat1).toBe(0);
    expect(document.querySelector('button[data-kind="quickUpgrade"][data-piece="helm1"]')).toBeNull();
    const activeLevel = document.querySelector('[data-piece="helm1"] button[data-kind="setLvl"].active');
    expect(activeLevel?.textContent).toBe('Lv1');
  });

  it('filters armor pieces and categories based on search input', () => {
    setup();
    const search = document.querySelector('#armorSearch');
    const accordions = Array.from(document.querySelectorAll('.accordion'));

    search.value = 'sand';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    const visibleAccordions = accordions.filter((acc) => acc.style.display !== 'none');
    expect(visibleAccordions).toHaveLength(1);
    expect(visibleAccordions[0].dataset.cat).toBe('Gerudo');
    expect(visibleAccordions[0].querySelector('.piece').style.display).not.toBe('none');
  });

  it('shows acquisition info for armor material requirements when available', () => {
    setup({ materialSources: { mat1: { where: 'Hyrule Ridge', coords: '123, 456, 789' } } });
    document.querySelector('.acc-head').click();

    const inlineInfo = document.querySelector('.mat-acq-inline');
    expect(inlineInfo).not.toBeNull();
    expect(inlineInfo.textContent).toContain('Hyrule Ridge');
    expect(inlineInfo.textContent).toContain('123, 456, 789');
  });

  it('shows acquisition info for materials when available', () => {
    setup({ materialSources: { mat1: { where: 'Hyrule Ridge', notes: 'Night only' } } });
    const matTab = document.querySelector('button[data-tab="materials"]');
    matTab.click();

    const info = document.querySelector('.mat-info');
    expect(info).not.toBeNull();
    expect(info.textContent).toContain('Hyrule Ridge');
    expect(info.textContent).toContain('Night only');
  });

  it('keeps required labels intact after updating inventory in materials view', () => {
    setup();
    const matTab = document.querySelector('button[data-tab="materials"]');
    matTab.click();

    const row = document.querySelector('tr[data-mid="mat1"]');
    const labelBefore = row.querySelector('.mat-col-label');
    expect(labelBefore).not.toBeNull();
    expect(labelBefore.textContent).toContain('Required');

    row.querySelector('button.step[data-kind="inc"]').click();

    const labelAfter = row.querySelector('.mat-col-label');
    expect(labelAfter).not.toBeNull();
    expect(labelAfter.textContent).toContain('Required');
  });

  it('filters to deficits and sorts after filtering', () => {
    setup();
    const matTab = document.querySelector('button[data-tab="materials"]');
    matTab.click();

    const mat1Input = document.querySelector('input[data-kind="inv"][data-mid="mat1"]');
    mat1Input.value = '5';
    mat1Input.dispatchEvent(new Event('input', { bubbles: true }));

    const namesByNeed = getMaterialNames();
    expect(namesByNeed[0]).toBe('Molduga Guts');

    const deficitsToggle = document.querySelector('#matDeficitsOnly');
    deficitsToggle.click();

    const filteredNames = getMaterialNames();
    expect(filteredNames).toEqual(['Molduga Guts']);
  });

  it('asks for confirmation before clearing progress', () => {
    const { storage } = setup();
    document.querySelector('.acc-head').click();
    document.querySelector('button.step[data-kind="inc"][data-mid="mat1"]').click();

    const resetBtn = document.querySelector('#btnReset');
    const dialog = document.querySelector('#resetDialog');
    const confirmBtn = document.querySelector('#resetConfirm');

    resetBtn.click();

    const savedBefore = JSON.parse(storage.getItem(LS_STATE));
    expect(dialog.open).toBe(true);
    expect(savedBefore.inventory.mat1).toBe(1);

    confirmBtn.click();

    const savedAfter = JSON.parse(storage.getItem(LS_STATE));
    expect(savedAfter.inventory.mat1).toBe(0);
    expect(dialog.open).toBe(false);
  });

  it('saves material view preferences to storage', () => {
    const { storage } = setup();
    const matTab = document.querySelector('button[data-tab="materials"]');
    matTab.click();

    const sortSelect = document.querySelector('#matSort');
    sortSelect.value = 'alpha';
    sortSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const deficitsToggle = document.querySelector('#matDeficitsOnly');
    deficitsToggle.click();

    const saved = JSON.parse(storage.getItem(LS_STATE));
    expect(saved.ui.materials.sort).toBe('alpha');
    expect(saved.ui.materials.deficitsOnly).toBe(true);
  });

  it('filters armor list to incomplete pieces when toggled', () => {
    setup();
    document.querySelector('.acc-head').click();

    const levelFourButton = document.querySelector("[data-piece='helm1'][data-kind='setLvl'][data-lvl='4']");
    levelFourButton.click();

    const incompleteToggle = document.querySelector('#armorIncompleteToggle');
    incompleteToggle.click();

    expect(document.querySelector("[data-piece='helm1']")).toBeNull();
    expect(Array.from(document.querySelectorAll('.piece')).length).toBe(2);
  });

  it('sorts armor pieces by selected sort option', () => {
    setup();
    const hylianAcc = document.querySelector('.accordion[data-cat="Hylian"]');
    hylianAcc.querySelector('.acc-head').click();

    hylianAcc.querySelector("[data-piece='helm1'][data-kind='setLvl'][data-lvl='3']").click();
    hylianAcc.querySelector("[data-piece='chest1'][data-kind='setLvl'][data-lvl='1']").click();

    const sortSelect = document.querySelector('#armorSort');
    sortSelect.value = 'level-desc';
    sortSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const titles = Array.from(document.querySelectorAll('.accordion[data-cat="Hylian"] .piece .title')).map((el) => el.textContent);
    expect(titles[0]).toBe('Hylian Helm');
    expect(titles[1]).toBe('Hylian Tunic');
  });

  it('orders top materials by deficit and displays deficit values', () => {
    setup({
      adjustState: (state) => {
        state.inventory.mat1 = 5;
        state.inventory.mat2 = 0;
      }
    });

    const rows = Array.from(document.querySelectorAll('#view-summary tbody tr'));
    const names = rows.map((row) => row.querySelector('.mat-name b').textContent);
    const deficits = rows.map((row) => Number(row.querySelector('.short-val').textContent));

    expect(names).toEqual(['Molduga Guts', 'Bokoblin Horn']);
    expect(deficits).toEqual([1, 0]);
  });
});
