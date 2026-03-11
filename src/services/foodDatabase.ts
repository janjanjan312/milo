import type { MealLogPayloadItem } from './ai';
import type { PlanFoodItem } from '../context/AppContext';

export interface FoodNutritionItem {
  foodCode: string;
  foodName: string;
  cleanName: string;
  energyKCal: number;
  protein: number;
  fat: number;
  carbs: number;
  dietaryFiber: number;
}

interface RawFoodEntry {
  code: string;
  name: string;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
}

let _database: FoodNutritionItem[] | null = null;
let _loadPromise: Promise<void> | null = null;

const CUSTOM_DB_KEY = 'diet_assistant_custom_foods';
let _customDatabase: FoodNutritionItem[] = [];

function loadCustomDatabase(): void {
  try {
    const raw = localStorage.getItem(CUSTOM_DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      _customDatabase = Array.isArray(parsed)
        ? parsed.map((item: any) => ({
            ...item,
            cleanName: item.cleanName || extractCleanName(item.foodName || ''),
          }))
        : [];
    }
  } catch {
    _customDatabase = [];
  }
}

function saveCustomDatabase(): void {
  try {
    localStorage.setItem(CUSTOM_DB_KEY, JSON.stringify(_customDatabase));
  } catch {
    console.warn('Failed to save custom food database to localStorage');
  }
}

loadCustomDatabase();

export function addCustomFood(item: Omit<FoodNutritionItem, 'foodCode' | 'cleanName'>): void {
  const existing = _customDatabase.findIndex(
    f => normalize(f.cleanName) === normalize(extractCleanName(item.foodName))
  );
  const entry: FoodNutritionItem = {
    foodCode: `custom_${Date.now()}`,
    foodName: item.foodName,
    cleanName: extractCleanName(item.foodName),
    energyKCal: item.energyKCal,
    protein: item.protein,
    fat: item.fat,
    carbs: item.carbs,
    dietaryFiber: item.dietaryFiber,
  };
  if (existing >= 0) {
    _customDatabase[existing] = entry;
  } else {
    _customDatabase.push(entry);
  }
  saveCustomDatabase();
}

export function getCustomFoodCount(): number {
  return _customDatabase.length;
}

function extractCleanName(raw: string): string {
  return raw
    .replace(/（[^）]*）/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[,，、]/g, '')
    .trim();
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s（()）,，、。.：:]/g, '');
}

function parseRawEntries(entries: RawFoodEntry[]): FoodNutritionItem[] {
  return entries
    .filter(e => e.name)
    .map(e => ({
      foodCode: e.code || '',
      foodName: e.name,
      cleanName: extractCleanName(e.name),
      energyKCal: e.kcal || 0,
      protein: e.protein || 0,
      fat: e.fat || 0,
      carbs: e.carbs || 0,
      dietaryFiber: e.fiber || 0,
    }));
}

/**
 * Lazily load the merged food database. Resolves immediately if already loaded.
 * Called automatically on module import; also call from async entry points
 * (sendMessageToAI, etc.) to guarantee data is ready before use.
 */
export function ensureFoodDatabaseLoaded(): Promise<void> {
  if (_database) return Promise.resolve();
  if (!_loadPromise) {
    _loadPromise = import('../data/allFoods.json')
      .then(mod => {
        const raw: RawFoodEntry[] = (mod as any).default || mod;
        if (Array.isArray(raw)) {
          _database = parseRawEntries(raw);
        }
      })
      .catch(err => {
        console.warn('Failed to load food database', err);
        _database = [];
      });
  }
  return _loadPromise;
}

// Fire immediately on module import so data starts loading as early as possible.
ensureFoodDatabaseLoaded();

function getDatabase(): FoodNutritionItem[] {
  const main = _database || [];
  if (_customDatabase.length === 0) return main;
  const mainNames = new Set(main.map(f => normalize(f.cleanName)));
  const filtered = _customDatabase.filter(f => !mainNames.has(normalize(f.cleanName)));
  if (filtered.length === 0) return main;
  return [...filtered, ...main];
}

// ---------------------------------------------------------------------------
// Search & match
// ---------------------------------------------------------------------------

export interface ScoredFoodItem {
  item: FoodNutritionItem;
  score: number;
}

export function searchFoodWithScore(query: string, limit = 5): ScoredFoodItem[] {
  const db = getDatabase();

  const cleanQuery = extractCleanName(query);
  const q = normalize(cleanQuery);
  if (!q || q.length < 1) return [];

  const scored: ScoredFoodItem[] = [];

  for (const item of db) {
    const name = normalize(item.cleanName);
    const fullName = normalize(item.foodName);
    let score = 0;

    if (name === q) {
      score = 100;
      if (/[（(]/.test(item.foodName)) {
        score -= 3;
      }
    } else if (fullName === q) {
      score = 95;
    } else if (name.startsWith(q) || q.startsWith(name)) {
      score = 85 - Math.abs(name.length - q.length) * 2;
      if (q.startsWith(name) && q.length > name.length) {
        const coverageRatio = name.length / q.length;
        if (coverageRatio < 0.75) {
          score -= Math.round((0.75 - coverageRatio) * 50);
        }
      }
      if (q.length <= 2 && name.length > q.length + 2) score -= 30;
      if (q.length <= 2 && name.length > q.length) score -= 25;
    } else if (name.includes(q)) {
      score = 75 - (name.length - q.length);
      if (q.length <= 2) score -= 20;
    } else if (q.includes(name) && name.length >= 2) {
      score = 65;
      if (q.endsWith(name)) {
        score += 15;
      }
    } else if (fullName.includes(q)) {
      score = 60 - (fullName.length - q.length);
      if (q.length <= 2) score -= 20;
    }

    if (item.foodName.includes('代表值') && score > 0) score += 5;

    const processedTerms = ['脱水', '干制', '冻干', '腌制', '油炸', '罐头', '粉状'];
    for (const term of processedTerms) {
      if (item.foodName.includes(term) && !cleanQuery.includes(term)) {
        score -= 30;
      }
    }
    if (/[（(][^）)]*干[^）)]*[）)]/.test(item.foodName) && !query.includes('干')) {
      score -= 35;
    }

    if (score > 30) {
      scored.push({ item, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export function searchFood(query: string, limit = 5): FoodNutritionItem[] {
  return searchFoodWithScore(query, limit).map(s => s.item);
}

export function findFoodsInText(text: string): FoodNutritionItem[] {
  const db = getDatabase();
  const normalizedText = normalize(text);
  if (!normalizedText) return [];

  const matches: { item: FoodNutritionItem; score: number }[] = [];
  const seenCleanNames = new Map<string, number>();

  for (const item of db) {
    const cleanN = normalize(item.cleanName);
    if (cleanN.length < 2) continue;

    if (normalizedText.includes(cleanN)) {
      const score = cleanN.length * 10 + (item.foodName.includes('代表值') ? 5 : 0);
      const existingIdx = seenCleanNames.get(cleanN);

      if (existingIdx !== undefined) {
        if (score > matches[existingIdx].score) {
          matches[existingIdx] = { item, score };
        }
      } else {
        seenCleanNames.set(cleanN, matches.length);
        matches.push({ item, score });
      }
    }
  }

  const filtered = matches.filter(m => {
    const mName = normalize(m.item.cleanName);
    return !matches.some(other => {
      if (other === m) return false;
      const oName = normalize(other.item.cleanName);
      return oName.length > mName.length && oName.includes(mName);
    });
  });

  filtered.sort((a, b) => b.score - a.score);
  return filtered.slice(0, 10).map(m => m.item);
}

// ---------------------------------------------------------------------------
// Nutrition lookup & enrichment
// ---------------------------------------------------------------------------

function convertToGrams(serving: number, unit: string): number {
  const u = (unit || 'g').toLowerCase();
  if (u === 'g' || u === '克') return serving;
  if (u === 'ml' || u === '毫升') return serving;
  if (u === 'kg' || u === '千克') return serving * 1000;
  if (u === 'oz') return serving * 28.35;
  if (u === 'cup' || u === '杯') return serving * 240;
  if (u === 'pcs' || u === '个' || u === '份' || u === '只' || u === '枚') return serving * 50;
  return serving;
}

const MIN_ENRICH_SCORE = 60;

export function getNutritionForServing(foodName: string, servingG: number): {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  dietaryFiber: number;
  matched: boolean;
  matchedFoodName?: string;
} {
  const matches = searchFoodWithScore(foodName, 1);
  if (matches.length === 0 || matches[0].score < MIN_ENRICH_SCORE) {
    return { calories: 0, protein: 0, fat: 0, carbs: 0, dietaryFiber: 0, matched: false };
  }

  const food = matches[0].item;
  const factor = servingG / 100;

  return {
    calories: Math.round(food.energyKCal * factor),
    protein: Math.round(food.protein * factor * 10) / 10,
    fat: Math.round(food.fat * factor * 10) / 10,
    carbs: Math.round(food.carbs * factor * 10) / 10,
    dietaryFiber: Math.round(food.dietaryFiber * factor * 10) / 10,
    matched: true,
    matchedFoodName: food.foodName,
  };
}

export function formatFoodReferencesForPrompt(foods: FoodNutritionItem[]): string {
  if (foods.length === 0) return '';

  const lines = foods.map(f =>
    `- ${f.cleanName}: ${f.energyKCal}kcal, P${f.protein}g, C${f.carbs}g, F${f.fat}g`
  );

  return [
    '',
    'Nutrition reference (per 100g, from food composition database):',
    ...lines,
    'Use these values as basis. Scale by actual weight.',
    '',
  ].join('\n');
}

export function enrichMealLogItems(items: MealLogPayloadItem[]): MealLogPayloadItem[] {
  return items.map(item => {
    const servingG = convertToGrams(Number(item.serving) || 0, item.unit);
    if (servingG <= 0) return item;

    const result = getNutritionForServing(item.name, servingG);
    if (!result.matched) return item;

    return {
      ...item,
      protein: result.protein,
      carbs: result.carbs,
      fat: result.fat,
      calories: result.calories,
    };
  });
}

export function enrichPlanFoodItems(items: PlanFoodItem[]): PlanFoodItem[] {
  if (!items || !Array.isArray(items)) return items;
  return items.map(item => {
    const servingG = convertToGrams(Number(item.serving) || 0, item.unit);
    if (servingG <= 0) return item;

    const result = getNutritionForServing(item.name, servingG);
    if (!result.matched) return item;

    return {
      ...item,
      protein: result.protein,
      carbs: result.carbs,
      fat: result.fat,
      calories: result.calories,
    };
  });
}

export function estimateNutritionFromDB(name: string, serving: number, unit = 'g'): {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  category: 'Prot' | 'Veg' | 'Carb' | 'Fat';
  matched: boolean;
} {
  const servingG = convertToGrams(serving, unit);
  if (servingG <= 0 || !name.trim()) {
    return { calories: 0, protein: 0, carbs: 0, fat: 0, category: 'Carb', matched: false };
  }

  const result = getNutritionForServing(name, servingG);
  if (!result.matched) {
    return { calories: 0, protein: 0, carbs: 0, fat: 0, category: 'Carb', matched: false };
  }

  const per100gCal = servingG > 0 ? (result.calories / servingG) * 100 : result.calories;

  let category: 'Prot' | 'Veg' | 'Carb' | 'Fat' = 'Carb';
  if (per100gCal < 50) {
    category = 'Veg';
  } else if (result.protein >= result.carbs && result.protein >= result.fat) {
    category = 'Prot';
  } else if (result.fat >= result.protein && result.fat >= result.carbs) {
    category = 'Fat';
  }

  return {
    calories: result.calories,
    protein: Math.round(result.protein),
    carbs: Math.round(result.carbs),
    fat: Math.round(result.fat),
    category,
    matched: true,
  };
}
