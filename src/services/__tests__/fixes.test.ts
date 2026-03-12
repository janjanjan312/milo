import { describe, it, expect } from 'vitest';
import { computeNutritionTargets } from '../ai';
import type { MealPlan, PlanFoodItem } from '../../context/AppContext';

// Helper: simulate the post-processing scaling logic from ai.ts (sendMessageToAI)
function applyPlanScaling(
  mealPlan: { breakfast: PlanFoodItem[]; lunch: PlanFoodItem[]; dinner: PlanFoodItem[]; snack: PlanFoodItem[] },
  targetCalories: number
) {
  const mealSlots = [mealPlan.breakfast, mealPlan.lunch, mealPlan.dinner, mealPlan.snack];
  const filledSlots = mealSlots.filter(s => s.length > 0).length;
  const isSingleMealPlan = filledSlots === 1;
  const allItems = mealSlots.flat();
  const totalCal = allItems.reduce((s, i) => s + (i.calories || 0), 0);

  if (!isSingleMealPlan && totalCal > 0 && Math.abs(totalCal - targetCalories) / targetCalories > 0.15) {
    const ratio = targetCalories / totalCal;
    const scale = (items: PlanFoodItem[]) => items.map(item => ({
      ...item,
      serving: Math.round(item.serving * ratio * 10) / 10,
      calories: Math.round(item.calories * ratio),
    }));
    return {
      breakfast: scale(mealPlan.breakfast),
      lunch: scale(mealPlan.lunch),
      dinner: scale(mealPlan.dinner),
      snack: scale(mealPlan.snack),
      scaled: true,
    };
  }

  return { ...mealPlan, scaled: false };
}

function makePlanItem(overrides: Partial<PlanFoodItem> = {}): PlanFoodItem {
  return {
    id: 'test',
    category: 'Carb',
    name: 'Test Food',
    serving: 100,
    unit: 'g',
    protein: 10,
    carbs: 20,
    fat: 5,
    calories: 200,
    ...overrides,
  };
}

// Helper: simulate todaySummary calculation from buildSystemPrompt
function buildTodaySummary(
  logs: { calories: number; protein: number; carbs: number; fat: number; timestamp: number }[],
  userContext: { weight?: number; height?: number; age?: number; gender?: string; exerciseCalories?: number; goals?: string[]; activity?: any },
) {
  const targets = computeNutritionTargets(userContext);
  const now = new Date();
  const todayLogs = logs.filter(l => {
    const d = new Date(l.timestamp);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  });
  const eaten = todayLogs.reduce((a, l) => ({
    calories: a.calories + (l.calories || 0),
    protein: a.protein + (l.protein || 0),
    carbs: a.carbs + (l.carbs || 0),
    fat: a.fat + (l.fat || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const exerciseCal = Number(userContext.exerciseCalories) || 0;
  const dynamicTarget = targets.targetCalories + exerciseCal;
  const remaining = {
    calories: dynamicTarget - eaten.calories,
    protein: targets.macros.proteinG - eaten.protein,
  };
  return { eaten, remaining, dynamicTarget, baseTarget: targets.targetCalories };
}

// ---------------------------------------------------------------------------

describe('Single meal plan scaling', () => {
  it('should NOT scale a single-meal (snack) recommendation', () => {
    const plan = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: [
        makePlanItem({ name: '烤香蕉片', serving: 30, calories: 35 }),
        makePlanItem({ name: '海苔脆片', serving: 10, calories: 30 }),
      ],
    };
    const result = applyPlanScaling(plan, 1200);
    expect(result.scaled).toBe(false);
    expect(result.snack[0].serving).toBe(30);
    expect(result.snack[0].calories).toBe(35);
    expect(result.snack[1].serving).toBe(10);
    expect(result.snack[1].calories).toBe(30);
  });

  it('should NOT scale a single-meal (dinner) recommendation', () => {
    const plan = {
      breakfast: [],
      lunch: [],
      dinner: [
        makePlanItem({ name: '鸡胸肉', serving: 150, calories: 250 }),
        makePlanItem({ name: '西兰花', serving: 100, calories: 30 }),
      ],
      snack: [],
    };
    const result = applyPlanScaling(plan, 1200);
    expect(result.scaled).toBe(false);
    expect(result.dinner[0].serving).toBe(150);
  });

  it('should scale a full-day plan that is too low', () => {
    const plan = {
      breakfast: [makePlanItem({ calories: 200 })],
      lunch: [makePlanItem({ calories: 200 })],
      dinner: [makePlanItem({ calories: 200 })],
      snack: [makePlanItem({ calories: 100 })],
    };
    // Total = 700, target = 1200 → deviation 42% > 15% → should scale
    const result = applyPlanScaling(plan, 1200);
    expect(result.scaled).toBe(true);
    const totalAfter = [
      ...result.breakfast, ...result.lunch, ...result.dinner, ...result.snack,
    ].reduce((s, i) => s + i.calories, 0);
    expect(totalAfter).toBeGreaterThan(1100);
    expect(totalAfter).toBeLessThan(1300);
  });

  it('should NOT scale a full-day plan within 15% of target', () => {
    const plan = {
      breakfast: [makePlanItem({ calories: 300 })],
      lunch: [makePlanItem({ calories: 400 })],
      dinner: [makePlanItem({ calories: 350 })],
      snack: [makePlanItem({ calories: 100 })],
    };
    // Total = 1150, target = 1200 → deviation 4% < 15% → no scale
    const result = applyPlanScaling(plan, 1200);
    expect(result.scaled).toBe(false);
  });
});

describe('Exercise calories in remaining budget', () => {
  const baseUser = {
    weight: 55,
    height: 165,
    age: 30,
    gender: 'female',
    goals: ['fat_loss'],
    activity: { type: 'mixed', intensity: 'moderate', frequency: '3-4' },
  };

  it('should include exercise calories in dynamic target', () => {
    const logs = [
      { calories: 400, protein: 20, carbs: 50, fat: 10, timestamp: Date.now() },
      { calories: 500, protein: 25, carbs: 60, fat: 15, timestamp: Date.now() },
    ];

    const withoutExercise = buildTodaySummary(logs, { ...baseUser, exerciseCalories: 0 });
    const withExercise = buildTodaySummary(logs, { ...baseUser, exerciseCalories: 153 });

    expect(withExercise.dynamicTarget).toBe(withoutExercise.baseTarget + 153);
    expect(withExercise.remaining.calories).toBe(withoutExercise.remaining.calories + 153);
  });

  it('should handle zero exercise calories', () => {
    const logs = [
      { calories: 300, protein: 15, carbs: 40, fat: 8, timestamp: Date.now() },
    ];
    const result = buildTodaySummary(logs, { ...baseUser, exerciseCalories: 0 });
    expect(result.dynamicTarget).toBe(result.baseTarget);
    expect(result.remaining.calories).toBe(result.baseTarget - 300);
  });

  it('should only count today logs, not yesterday', () => {
    const yesterday = Date.now() - 24 * 60 * 60 * 1000;
    const logs = [
      { calories: 500, protein: 25, carbs: 60, fat: 15, timestamp: yesterday },
      { calories: 300, protein: 15, carbs: 40, fat: 8, timestamp: Date.now() },
    ];
    const result = buildTodaySummary(logs, { ...baseUser, exerciseCalories: 0 });
    expect(result.eaten.calories).toBe(300);
  });
});

describe('computeNutritionTargets', () => {
  it('should enforce minimum calories for female', () => {
    const targets = computeNutritionTargets({
      weight: 40,
      height: 150,
      age: 20,
      gender: 'female',
      goals: ['fat_loss'],
      activity: { type: 'sedentary', intensity: 'low', frequency: '1-2' },
    });
    expect(targets.targetCalories).toBeGreaterThanOrEqual(1200);
  });

  it('should enforce minimum calories for male', () => {
    const targets = computeNutritionTargets({
      weight: 50,
      height: 160,
      age: 20,
      gender: 'male',
      goals: ['fat_loss'],
      activity: { type: 'sedentary', intensity: 'low', frequency: '1-2' },
    });
    expect(targets.targetCalories).toBeGreaterThanOrEqual(1400);
  });

  it('should return macros that approximately match calorie target', () => {
    const targets = computeNutritionTargets({
      weight: 65,
      height: 170,
      age: 25,
      gender: 'male',
      goals: ['fat_loss'],
      activity: { type: 'mixed', intensity: 'moderate', frequency: '3-4' },
    });
    const macroCalories =
      targets.macros.proteinG * 4 +
      targets.macros.carbsG * 4 +
      targets.macros.fatG * 9;
    expect(Math.abs(macroCalories - targets.targetCalories)).toBeLessThan(50);
  });
});
