import { Flame, Zap, Leaf } from 'lucide-react';
import { PlanTemplate } from '../context/AppContext';

export type { PlanTemplate };

export const PRESET_PLANS: PlanTemplate[] = [
  {
    id: 'plan_balanced',
    name: 'Balanced',
    description: 'Mix of carbs, protein & fats.',
    icon: Leaf,
    color: 'bg-indigo-100 text-indigo-700',
    items: [
      { name: 'Oatmeal & Berries', calories: 350, protein: 12, carbs: 45, fat: 6, veggie: 0, type: 'breakfast', category: 'Carb', serving: 1, unit: 'bowl' },
      { name: 'Grilled Chicken Salad', calories: 450, protein: 40, carbs: 12, fat: 20, veggie: 200, type: 'lunch', category: 'Prot', serving: 1, unit: 'plate' },
      { name: 'Salmon & Asparagus', calories: 500, protein: 35, carbs: 8, fat: 28, veggie: 150, type: 'dinner', category: 'Fat', serving: 1, unit: 'plate' },
      { name: 'Apple', calories: 95, protein: 0, carbs: 25, fat: 0, veggie: 0, type: 'snack', category: 'Carb', serving: 1, unit: 'medium' },
    ]
  },
  {
    id: 'plan_low_carb',
    name: 'Low Carb',
    description: 'High protein, minimal carbs.',
    icon: Flame,
    color: 'bg-red-100 text-red-700',
    items: [
      { name: 'Eggs & Avocado', calories: 400, protein: 20, carbs: 5, fat: 30, veggie: 0, type: 'breakfast', category: 'Fat', serving: 2, unit: 'eggs' },
      { name: 'Steak Salad', calories: 600, protein: 50, carbs: 10, fat: 35, veggie: 150, type: 'lunch', category: 'Prot', serving: 1, unit: 'plate' },
      { name: 'Grilled Salmon', calories: 450, protein: 40, carbs: 0, fat: 25, veggie: 0, type: 'dinner', category: 'Prot', serving: 200, unit: 'g' },
      { name: 'Almonds', calories: 160, protein: 6, carbs: 6, fat: 14, veggie: 0, type: 'snack', category: 'Fat', serving: 30, unit: 'g' },
    ]
  },
  {
    id: 'plan_high_protein',
    name: 'Muscle Gain',
    description: 'Maximized protein intake.',
    icon: Zap,
    color: 'bg-indigo-100 text-indigo-700',
    items: [
      { name: 'Protein Shake', calories: 150, protein: 30, carbs: 5, fat: 2, veggie: 0, type: 'breakfast', category: 'Prot', serving: 1, unit: 'scoop' },
      { name: 'Chicken & Rice', calories: 550, protein: 45, carbs: 60, fat: 10, veggie: 100, type: 'lunch', category: 'Prot', serving: 1, unit: 'bowl' },
      { name: 'Lean Beef Stir-fry', calories: 600, protein: 50, carbs: 40, fat: 20, veggie: 200, type: 'dinner', category: 'Prot', serving: 1, unit: 'plate' },
      { name: 'Greek Yogurt', calories: 120, protein: 15, carbs: 8, fat: 0, veggie: 0, type: 'snack', category: 'Prot', serving: 1, unit: 'cup' },
    ]
  }
];

export const PLAN_COLORS = [
  'bg-indigo-100 text-indigo-700',
  'bg-indigo-100 text-indigo-700',
  'bg-red-100 text-red-700',
  'bg-purple-100 text-purple-700',
  'bg-amber-100 text-amber-700',
  'bg-pink-100 text-pink-700',
  'bg-indigo-100 text-indigo-700',
  'bg-cyan-100 text-cyan-700',
  'bg-orange-100 text-orange-700',
  'bg-stone-900 text-white',
];

export const getRandomPlanColor = () => {
  return PLAN_COLORS[Math.floor(Math.random() * (PLAN_COLORS.length - 1))]; // Exclude the last dark one for better variety
};
