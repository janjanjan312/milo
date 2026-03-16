import { describe, it, expect, beforeAll } from 'vitest';
import {
  ensureFoodDatabaseLoaded,
  searchFoodWithScore,
  estimateNutritionFromDB,
  getNutritionForServing,
} from './foodDatabase';

describe('foodDatabase – 加载与搜索（中文 allFoods + 英文 USDA）', () => {
  beforeAll(async () => {
    await ensureFoodDatabaseLoaded();
  });

  describe('USDA 英文表常见食物搜索', () => {
    // 必须能匹配且 100g 热量在合理范围（与 USDA/中文表一致）
    const mustMatchQueries = [
      { query: 'avocado', minKcal: 140, maxKcal: 250, desc: '牛油果/鳄梨' },
      { query: 'banana', minKcal: 70, maxKcal: 120, desc: '香蕉' },
      { query: 'broccoli', minKcal: 30, maxKcal: 50, desc: '西兰花' },
      { query: 'Hummus', minKcal: 200, maxKcal: 280, desc: '鹰嘴豆泥' },
    ];

    mustMatchQueries.forEach(({ query, minKcal, maxKcal, desc }) => {
      it(`"${query}" (${desc}) 能搜到且 100g 热量在合理范围`, () => {
        const scored = searchFoodWithScore(query, 3);
        expect(scored.length).toBeGreaterThan(0);

        const result = estimateNutritionFromDB(query, 100, 'g');
        expect(result.matched, `"${query}" 应有匹配结果`).toBe(true);
        expect(result.calories, `"${query}" 100g 热量应在 ${minKcal}-${maxKcal}`).toBeGreaterThanOrEqual(minKcal);
        expect(result.calories, `"${query}" 100g 热量应在 ${minKcal}-${maxKcal}`).toBeLessThanOrEqual(maxKcal);
      });
    });

    // 仅断言能搜到（合并库中含中文或 USDA 英文），不要求 estimate 一定命中
    const searchOnlyQueries = [
      'chicken breast',
      'salmon',
      'almond',
      'yogurt',
      'oats',
      'egg',
      'Blueberries',
    ];

    searchOnlyQueries.forEach((query) => {
      it(`"${query}" 在合并库中能搜到`, () => {
        const scored = searchFoodWithScore(query, 5);
        expect(scored.length).toBeGreaterThan(0);
        const withKcal = scored.find(s => s.item.energyKCal > 0);
        expect(withKcal, `"${query}" 至少应有一条结果带热量`).toBeDefined();
      });
    });
  });

  describe('中文 query 搜索（中文表 allFoods）', () => {
    // 必须能匹配且 100g 热量在合理范围
    const mustMatchZh = [
      { query: '牛油果', per100: { min: 140, max: 170 }, desc: '牛油果' },
      { query: '炼乳', per100: { min: 260, max: 400 }, desc: '炼乳' },
      { query: '黄油', per100: { min: 700, max: 900 }, desc: '黄油' },
      { query: '全脂奶粉', per100: { min: 480, max: 520 }, desc: '全脂奶粉' },
      { query: '奶酪', per100: { min: 250, max: 400 }, desc: '奶酪' },
      { query: '奶油', per100: { min: 300, max: 900 }, desc: '奶油' },
    ];

    mustMatchZh.forEach(({ query, per100, desc }) => {
      it(`「${query}」(${desc}) 能搜到且 100g 热量在合理范围`, () => {
        const scored = searchFoodWithScore(query, 3);
        expect(scored.length).toBeGreaterThan(0);

        const result = estimateNutritionFromDB(query, 100, 'g');
        expect(result.matched, `「${query}」应有匹配结果`).toBe(true);
        expect(result.calories, `「${query}」100g 应在 ${per100.min}-${per100.max}`).toBeGreaterThanOrEqual(per100.min);
        expect(result.calories, `「${query}」100g 应在 ${per100.min}-${per100.max}`).toBeLessThanOrEqual(per100.max);
      });
    });

    // 仅断言能搜到且至少一条带热量
    const searchOnlyZh = ['酸奶', '牛奶', '奶粉', '鸡蛋', '苹果', '香蕉', '鸡胸肉', '西兰花', '三文鱼', '燕麦'];

    searchOnlyZh.forEach((query) => {
      it(`「${query}」在合并库中能搜到`, () => {
        const scored = searchFoodWithScore(query, 5);
        expect(scored.length).toBeGreaterThan(0);
        const withKcal = scored.find(s => s.item.energyKCal > 0);
        expect(withKcal, `「${query}」至少应有一条结果带热量`).toBeDefined();
      });
    });
  });

  describe('中文名与英文名都能命中（牛油果 / avocado）', () => {
    it('中文「牛油果」20g 约 30–35 kcal（中文表条目）', () => {
      const result = estimateNutritionFromDB('牛油果', 20, 'g');
      expect(result.matched).toBe(true);
      expect(result.calories).toBeGreaterThanOrEqual(28);
      expect(result.calories).toBeLessThanOrEqual(45);
    });

    it('英文 "avocado" 100g 能命中 USDA 数据', () => {
      const result = estimateNutritionFromDB('avocado', 100, 'g');
      expect(result.matched).toBe(true);
      expect(result.calories).toBeGreaterThanOrEqual(160);
      expect(result.calories).toBeLessThanOrEqual(250);
    });

    it('getNutritionForServing("avocado", 20) 返回 20g 换算结果', () => {
      const result = getNutritionForServing('avocado', 20);
      expect(result.matched).toBe(true);
      expect(result.calories).toBeGreaterThan(0);
      expect(result.protein).toBeGreaterThanOrEqual(0);
      expect(result.fat).toBeGreaterThanOrEqual(0);
      expect(result.carbs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('搜索返回结构', () => {
    it('searchFoodWithScore 返回带 score 的条目', () => {
      const scored = searchFoodWithScore('avocado', 5);
      expect(scored.length).toBeGreaterThan(0);
      scored.forEach(({ item, score }) => {
        expect(item).toHaveProperty('foodName');
        expect(item).toHaveProperty('energyKCal');
        expect(item).toHaveProperty('protein');
        expect(item).toHaveProperty('fat');
        expect(item).toHaveProperty('carbs');
        expect(typeof score).toBe('number');
      });
    });

    it('estimateNutritionFromDB 100g 与 getNutritionForServing 100g 一致', () => {
      const name = 'banana';
      const est = estimateNutritionFromDB(name, 100, 'g');
      const serving = getNutritionForServing(name, 100);
      expect(est.matched).toBe(serving.matched);
      if (est.matched && serving.matched) {
        expect(est.calories).toBe(serving.calories);
      }
    });
  });
});
