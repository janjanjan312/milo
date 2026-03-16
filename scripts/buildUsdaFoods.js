/**
 * Build usdaFoods.json from FoodData/*.csv (USDA FoodData Central).
 * Output format matches RawFoodEntry: { code, name, kcal, protein, fat, carbs, fiber }
 * Run: node scripts/buildUsdaFoods.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FOOD_DATA_DIR = path.join(__dirname, '..', 'FoodData');
const OUT_PATH = path.join(__dirname, '..', 'src', 'data', 'usdaFoods.json');

// Nutrient IDs we need (per 100g in USDA)
const NUTRIENT_KCAL = ['2047', '1008']; // prefer Atwater (2047), fallback Energy (1008)
const NUTRIENT_PROTEIN = '1003';
const NUTRIENT_FAT = '1004';
const NUTRIENT_CARBS = '1005';
const NUTRIENT_FIBER = '1079';

function parseCsvLine(line) {
  const out = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let end = i + 1;
      while (end < line.length) {
        if (line[end] === '"' && (line[end + 1] === ',' || line[end + 1] === undefined || line[end + 1] === '\r')) {
          break;
        }
        if (line[end] === '"' && line[end + 1] === '"') end += 2; // escaped quote
        else end += 1;
      }
      out.push(line.slice(i + 1, end).replace(/""/g, '"'));
      i = end + 1;
      if (line[i] === ',') i += 1;
    } else {
      const comma = line.indexOf(',', i);
      const end = comma === -1 ? line.length : comma;
      out.push(line.slice(i, end).trim());
      i = end + (comma === -1 ? 0 : 1);
    }
  }
  return out;
}

function loadCsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    const obj = {};
    header.forEach((h, i) => { obj[h] = values[i] ?? ''; });
    return obj;
  });
  return { header, rows };
}

function main() {
  if (!fs.existsSync(FOOD_DATA_DIR)) {
    console.warn('FoodData/ not found, skip regenerating usdaFoods.json');
    return;
  }
  console.log('Loading foundation_food.csv...');
  const foundation = loadCsv(path.join(FOOD_DATA_DIR, 'foundation_food.csv'));
  const fdcIds = new Set(foundation.rows.map(r => r.fdc_id?.trim()).filter(Boolean));
  console.log(`Found ${fdcIds.size} foundation food IDs`);

  console.log('Loading food.csv (descriptions)...');
  const food = loadCsv(path.join(FOOD_DATA_DIR, 'food.csv'));
  const fdcToDesc = new Map();
  for (const row of food.rows) {
    const id = row.fdc_id?.trim();
    const desc = row.description?.trim();
    if (!id || !desc) continue;
    if (!fdcIds.has(id)) continue;
    // Prefer foundation_food type; otherwise first occurrence
    if (row.data_type === 'foundation_food' || !fdcToDesc.has(id)) {
      fdcToDesc.set(id, desc);
    }
  }
  console.log(`Got ${fdcToDesc.size} descriptions for foundation foods`);

  console.log('Loading food_nutrient.csv...');
  const nutrients = loadCsv(path.join(FOOD_DATA_DIR, 'food_nutrient.csv'));
  const byFdc = new Map(); // fdc_id -> { nutrient_id -> amount }
  for (const row of nutrients.rows) {
    const fdcId = row.fdc_id?.trim();
    if (!fdcIds.has(fdcId)) continue;
    const nutId = row.nutrient_id?.trim();
    const amount = parseFloat(row.amount);
    if (Number.isNaN(amount)) continue;
    if (!byFdc.has(fdcId)) byFdc.set(fdcId, {});
    byFdc.get(fdcId)[nutId] = amount;
  }
  console.log(`Got nutrients for ${byFdc.size} foundation foods`);

  const out = [];
  for (const fdcId of fdcIds) {
    const desc = fdcToDesc.get(fdcId);
    if (!desc) continue;
    const nut = byFdc.get(fdcId);
    if (!nut) continue;

    let kcal = nut[NUTRIENT_KCAL[0]] ?? nut[NUTRIENT_KCAL[1]];
    if (kcal == null) continue;
    kcal = Math.round(kcal);
    const protein = Math.round((nut[NUTRIENT_PROTEIN] ?? 0) * 10) / 10;
    const fat = Math.round((nut[NUTRIENT_FAT] ?? 0) * 10) / 10;
    const carbs = Math.round((nut[NUTRIENT_CARBS] ?? 0) * 10) / 10;
    const fiber = Math.round((nut[NUTRIENT_FIBER] ?? 0) * 10) / 10;

    out.push({
      code: `fdc_${fdcId}`,
      name: desc,
      kcal,
      protein,
      fat,
      carbs,
      fiber,
    });
  }

  out.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 0), 'utf-8');
  console.log(`Wrote ${out.length} foods to ${OUT_PATH}`);
}

main();
