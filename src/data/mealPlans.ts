import { PlanTemplate } from '../context/AppContext';

export type { PlanTemplate };

export const PRESET_PLANS: PlanTemplate[] = [];

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
