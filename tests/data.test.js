import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const dataPath = path.join(process.cwd(), 'botw_armor_data.json');
const rawData = fs.readFileSync(dataPath, 'utf-8');
const armorData = JSON.parse(rawData);

describe('armor data integrity', () => {
  it('includes required schema metadata', () => {
    expect(armorData.schemaVersion).toBe(1);
    expect(armorData.game).toBe('Breath of the Wild');
    expect(Array.isArray(armorData.armorPieces)).toBe(true);
    expect(armorData.armorPieces.length).toBeGreaterThan(0);
  });

  it('ensures each armor piece is well formed', () => {
    for (const piece of armorData.armorPieces) {
      expect(piece.id).toBeTruthy();
      expect(piece.name).toBeTruthy();
      expect(piece.slot).toBeTruthy();
      expect(piece.materialsByLevel).toBeTruthy();
      expect(typeof piece.materialsByLevel).toBe('object');

      const levels = Object.keys(piece.materialsByLevel);
      expect(levels).toEqual(expect.arrayContaining(['1', '2', '3', '4']));

      for (const level of levels) {
        const upgrades = piece.materialsByLevel[level];
        expect(Array.isArray(upgrades)).toBe(true);
        for (const upgrade of upgrades) {
          const materialName = upgrade.name || upgrade.material;
          const quantity = upgrade.quantity ?? upgrade.qty;

          expect(materialName).toBeTruthy();
          expect(typeof quantity).toBe('number');
          expect(quantity).toBeGreaterThan(0);
        }
      }
    }
  });
});
