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
  `;
}

function createStorage(){
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, v),
    removeItem: (k) => mem.delete(k)
  };
}

function setup(){
  createDOM();
  const storage = createStorage();
  const state = defaultState(DATA_FIXTURE);
  initUI({ data: DATA_FIXTURE, state, sources: {}, storage });
  return { storage, state };
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
    const root = document.querySelector('#armorAccordions');
    const custom = document.createElement('div');
    custom.innerHTML = `
      <div class="stepper">
        <button class="step" data-kind="inc" data-mid="mat1">+</button>
        <input data-kind="inv" data-mid="mat1" value="0" />
        <button class="step" data-kind="dec" data-mid="mat1">-</button>
      </div>
    `;
    root.appendChild(custom.firstElementChild);

    const inc = root.querySelector('button.step[data-mid="mat1"][data-kind="inc"]');
    inc.click();

    expect(state.inventory.mat1).toBe(1);
    const saved = JSON.parse(storage.getItem(LS_STATE));
    expect(saved.inventory.mat1).toBe(1);
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
});
