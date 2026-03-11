import { MealPlan, PlanFoodItem } from "../context/AppContext";
import { v4 as uuidv4 } from 'uuid';
import { findFoodsInText, formatFoodReferencesForPrompt, enrichMealLogItems, enrichPlanFoodItems, ensureFoodDatabaseLoaded, searchFood, addCustomFood } from './foodDatabase';

const dashscopeApiKey =
  (import.meta as any).env?.VITE_DASHSCOPE_API_KEY ||
  (import.meta as any).env?.DASHSCOPE_API_KEY ||
  (typeof globalThis !== 'undefined' &&
  ((globalThis as any).process?.env?.VITE_DASHSCOPE_API_KEY || (globalThis as any).process?.env?.DASHSCOPE_API_KEY)) ||
  '';
const arkApiKey =
  (import.meta as any).env?.VITE_ARK_API_KEY ||
  (import.meta as any).env?.ARK_API_KEY ||
  (typeof globalThis !== 'undefined' &&
  ((globalThis as any).process?.env?.VITE_ARK_API_KEY || (globalThis as any).process?.env?.ARK_API_KEY)) ||
  '';
const DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const QWEN_TEXT_MODEL = (import.meta as any).env?.VITE_QWEN_TEXT_MODEL || 'qwen3.5-flash';
const QWEN_VISION_MODEL = (import.meta as any).env?.VITE_QWEN_VISION_MODEL || 'qwen3-vl-flash';
const ARK_TEXT_MODEL = (import.meta as any).env?.VITE_ARK_TEXT_MODEL || 'deepseek-v3-250324';
const ARK_VISION_MODEL = (import.meta as any).env?.VITE_ARK_VISION_MODEL || '';
const TEXT_PROVIDER = ((import.meta as any).env?.VITE_TEXT_PROVIDER || 'ark').toLowerCase();
const VISION_PROVIDER = ((import.meta as any).env?.VITE_VISION_PROVIDER || 'qwen').toLowerCase();
const ENABLE_AI_LATENCY_LOG =
  ((import.meta as any).env?.VITE_ENABLE_AI_LATENCY_LOG ?? 'true') !== 'false';
type Provider = 'qwen' | 'ark';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  suggestions?: string[];
  isTranscribing?: boolean;
}

export interface MealLogPayloadItem {
  category: 'Prot' | 'Veg' | 'Carb' | 'Fat';
  name: string;
  serving: number;
  unit: string;
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
}

export interface MealLogPayload {
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  items: MealLogPayloadItem[];
}

export type InteractionScene = 'meal_estimate' | 'diet_coaching' | 'record_analysis';
export interface InteractionIntentResult {
  scene: InteractionScene;
  recordIntent: boolean;
}

function toNumber(value: any, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function computeNutritionTargets(userContext: any) {
  const weight = Math.max(35, toNumber(userContext?.weight, 65)); // kg
  const height = Math.max(140, toNumber(userContext?.height, 170)); // cm
  const age = Math.max(16, toNumber(userContext?.age, 25));
  const gender = String(userContext?.gender || 'other');
  const goals: string[] = Array.isArray(userContext?.goals) ? userContext.goals : [userContext?.goal || 'gut_health'];
  const hasGoal = (g: string) => goals.includes(g);
  const activityType = String(userContext?.activity?.type || 'mixed');
  const activityIntensity = String(userContext?.activity?.intensity || 'moderate');
  const activityFrequency = String(userContext?.activity?.frequency || '3-4');

  // Mifflin-St Jeor baseline.
  const genderOffset = gender === 'male' ? 5 : gender === 'female' ? -161 : -78;
  const bmr = 10 * weight + 6.25 * height - 5 * age + genderOffset;

  const intensityFactorMap: Record<string, number> = {
    low: 1.35,
    moderate: 1.5,
    high: 1.7,
  };
  const frequencyAdjustMap: Record<string, number> = {
    '1-2': -0.05,
    '3-4': 0,
    '5+': 0.08,
  };

  let activityFactor = intensityFactorMap[activityIntensity] ?? 1.5;
  if (activityType === 'sedentary') activityFactor = 1.2;
  activityFactor += frequencyAdjustMap[activityFrequency] ?? 0;
  activityFactor = Math.min(1.9, Math.max(1.2, activityFactor));

  const maintenanceCalories = bmr * activityFactor;
  // When multiple goals combine, fat_loss takes priority on caloric adjustment,
  // then muscle_gain; gut_health is calorie-neutral.
  let calorieAdjust = 0;
  if (hasGoal('fat_loss')) calorieAdjust = -0.2;
  else if (hasGoal('muscle_gain')) calorieAdjust = 0.1;
  const adjusted = maintenanceCalories * (1 + calorieAdjust);

  // Safety bounds for non-medical consumer plans.
  const minCalories = gender === 'female' ? 1200 : 1400;
  const maxCalories = 3200;
  let targetCalories = Math.round(Math.min(maxCalories, Math.max(minCalories, adjusted)) / 50) * 50;

  if (userContext?.customCalorieTarget) {
    const custom = toNumber(userContext.customCalorieTarget, 0);
    if (custom >= minCalories && custom <= maxCalories) {
      targetCalories = Math.round(custom / 50) * 50;
    }
  }

  // Macro ratios: muscle_gain prioritizes protein, fat_loss reduces fat, gut_health is moderate.
  const proteinPerKg = hasGoal('muscle_gain') ? 2.0 : hasGoal('fat_loss') ? 1.8 : 1.5;
  const fatPerKg = hasGoal('fat_loss') ? 0.7 : hasGoal('muscle_gain') ? 0.9 : 0.85;
  const proteinG = Math.round(weight * proteinPerKg);
  const fatG = Math.round(weight * fatPerKg);
  const remainingForCarb = targetCalories - (proteinG * 4 + fatG * 9);
  const carbsG = Math.max(80, Math.round(remainingForCarb / 4));

  return {
    bmr: Math.round(bmr),
    maintenanceCalories: Math.round(maintenanceCalories),
    targetCalories,
    macros: {
      proteinG,
      fatG,
      carbsG,
    },
  };
}

function formatCravingsForPrompt(cravings: any): string {
  const list = Array.isArray(cravings) ? cravings : [];
  if (list.length === 0) return 'None specified';
  const map: Record<string, string> = {
    sweets: 'sweet foods',
    fried: 'fried/crispy foods',
    salty: 'salty snacks',
    carbs: 'refined carbs',
    soda: 'sugary drinks/soda',
  };
  return list.map((c: string) => map[c] || c).join(', ');
}

function formatGutSymptomsForPrompt(gutSymptoms: any): string {
  const list = Array.isArray(gutSymptoms) ? gutSymptoms : [];
  if (list.length === 0) return 'None specified';
  const map: Record<string, string> = {
    bloating: 'bloating/gas',
    constipation: 'constipation',
    loose_stools: 'loose stools/diarrhea',
    acid_reflux: 'acid reflux/heartburn',
    cramps: 'abdominal cramps',
    food_intolerance: 'food intolerance (dairy, gluten, etc.)',
  };
  return list.map((s: string) => map[s] || s).join(', ');
}

function buildSystemPrompt(
  userContext: any,
  language: 'en' | 'zh',
  history: ChatMessage[],
  newMessage: string
) {
  const targets = computeNutritionTargets(userContext);
  const shouldAutoRecord = Boolean(userContext?.shouldAutoRecord);
  const scene = (userContext?.interactionScene as InteractionScene) || 'diet_coaching';
  const asksAdjustment =
    /(怎么调整|如何调整|如何优化|怎么吃更好|如何改进|需要建议|小贴士|tips?|how to adjust|how should i adjust|what should i change|optimi)/i
      .test(newMessage || '');

  const gutSymptomsText = formatGutSymptomsForPrompt(userContext.gutSymptoms);
  const userGoals: string[] = Array.isArray(userContext?.goals) ? userContext.goals : [userContext?.goal || 'gut_health'];
  const isGutGoal = userGoals.includes('gut_health');

  const waterTarget = Number(userContext?.waterTarget) || 2000;
  const todayWaterMl = Number(userContext?.todayWaterTotal) || 0;

  const baseInfo = `You are "麦粒" (Milo), an empathetic nutrition coach.
Always reply in ${language === 'en' ? 'English' : 'Chinese'}.

User profile:
- Goals: ${userGoals.join(', ')}
- ${userContext.age}yo, ${userContext.gender}, ${userContext.height}cm, ${userContext.weight}kg
- Activity: ${userContext.activity.type}, ${userContext.activity.intensity}, ${userContext.activity.frequency}x/week
- Diet preference: ${userContext.dietPreference}
- Cravings: ${formatCravingsForPrompt(userContext.cravings)}${isGutGoal ? `\n- Gut symptoms: ${gutSymptomsText}` : ''}
- Plans used: ${userContext.planCount}/5
- Water today: ${todayWaterMl}ml / ${waterTarget}ml target

Nutrition targets:
- BMR ${targets.bmr} | Maintenance ${targets.maintenanceCalories} | Target ${targets.targetCalories} kcal/day
- Macros: P ${targets.macros.proteinG}g, C ${targets.macros.carbsG}g, F ${targets.macros.fatG}g
${isGutGoal ? `
Gut-health dietary principles (apply when recommending foods):
- Bloating/gas: favor ginger, peppermint, fennel; limit raw cruciferous vegetables, beans, and carbonated drinks.
- Constipation: prioritize high-fiber foods (oats, flaxseed, prunes, leafy greens) and adequate hydration.
- Loose stools/diarrhea: recommend binding foods (rice, banana, toast); reduce insoluble fiber and greasy foods.
- Acid reflux: avoid spicy, acidic, high-fat foods and caffeine; recommend lean protein and non-citrus fruits.
- Cramps: suggest easily digestible meals, smaller portions; consider low-FODMAP options.
- Food intolerance: proactively offer dairy-free or gluten-free alternatives when applicable.
- General: include probiotic-rich foods (yogurt, kimchi, miso) and prebiotic fiber (garlic, onion, asparagus) where symptom-appropriate.
` : ''}`;

  const machineFormats = `Machine-readable formats (include when applicable):
- Speech correction: :::corrected_input::: corrected text :::
- Meal log (ONLY when user reports eating, NEVER in meal plans): :::meal_log:::{"mealType":"breakfast|lunch|dinner|snack","items":[{"category":"Prot|Veg|Carb|Fat","name":"","serving":0,"unit":"g","protein":0,"carbs":0,"fat":0,"calories":0}]}:::
  - mealType: infer from user context (e.g. "早餐吃了…"→breakfast, "午饭…"→lunch, "晚上吃的…"→dinner, "下午茶"→snack). If unclear, omit the field.
  - Include ALL foods, do not skip any item.
  - Serving size must be edible portion only (exclude peel, shell, bone, inedible parts). Use conservative, realistic single-serving estimates. Do NOT overestimate.
- Choice buttons (major decisions only, exactly 2 options, at very end): :::suggestions:::Option A|Option B:::
`;

  if (scene === 'meal_estimate') {
    const foodRefs = findFoodsInText(newMessage || '');
    const refBlock = formatFoodReferencesForPrompt(foodRefs);
    return `You are "麦粒", a nutrition assistant. Reply in ${language === 'en' ? 'English' : 'Chinese'}.
Identify all foods in the image/description. For each item, give name, estimated weight, and key macros (protein, carbs, fat, calories).
Keep it brief — use a short list, no lengthy paragraphs. End with a one-line total estimate.${refBlock}
${shouldAutoRecord ? `MANDATORY: Append this JSON block at the very end (required for saving):
:::meal_log:::{"mealType":"breakfast|lunch|dinner|snack","items":[{"category":"Prot|Veg|Carb|Fat|Drink|Fruit","name":"食物名","serving":100,"unit":"g","protein":0,"carbs":0,"fat":0,"calories":0}]}:::
Include EVERY food item. Do NOT skip any. Infer mealType from context (e.g. "早餐"→breakfast, "午饭"→lunch, "晚餐"→dinner, "下午茶/宵夜"→snack). If unclear, omit mealType.
Serving sizes must be edible portion only (no peel/shell/bone). Use conservative, realistic estimates.` : ''}
${asksAdjustment ? 'User asks for adjustment: give brief tips.' : 'No unsolicited tips.'}`;
  }

  if (scene === 'record_analysis') {
    const logs = userContext?.dailyLogs as any[] | undefined;
    let logsBlock = '';
    if (logs && logs.length > 0) {
      const summary = logs.map((item: any) => {
        const time = item.timestamp ? new Date(item.timestamp).toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' }) : '';
        return `[${item.type}${time ? ' ' + time : ''}] ${item.name} ${item.serving || ''}${item.unit || ''} — ${item.calories || 0}kcal P:${item.protein || 0}g C:${item.carbs || 0}g F:${item.fat || 0}g`;
      }).join('\n');
      logsBlock = `\n\nUser's food log data:\n${summary}\n`;
    } else {
      logsBlock = '\n\nUser has no food log entries yet.\n';
    }
    return `${baseInfo}\n${machineFormats}
Stage: Record Analysis (daily/weekly).${logsBlock}
- Analyze the food log data above in a warm, conversational tone — like a friend giving advice.
- First: briefly comment on the overall intake (calories vs target, any standout patterns). 2-3 sentences, natural and chatty.
- Then: 2-3 practical suggestions, numbered list. Each suggestion 1-2 short sentences, conversational but concise.
- End with a brief encouraging remark.
- If log data is empty, casually tell the user to log some meals first.
- Total response should be moderate length — not a wall of text, but not robotic bullet points either. Aim for ~150 characters in Chinese / ~80 words in English.
- Do NOT use bold titles or ask the user to choose.`;
  }

  const coachingLogs = userContext?.dailyLogs as any[] | undefined;
  let coachingLogsBlock = '';
  if (coachingLogs && coachingLogs.length > 0) {
    const byDate = new Map<string, string[]>();
    for (const item of coachingLogs) {
      const date = item.timestamp
        ? new Date(item.timestamp).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', weekday: 'short' })
        : 'unknown';
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push(
        `  [${item.type}] ${item.name} ${item.serving || ''}${item.unit || ''} — ${item.calories || 0}kcal P:${item.protein || 0}g C:${item.carbs || 0}g F:${item.fat || 0}g`
      );
    }
    const lines: string[] = [];
    for (const [date, entries] of byDate) {
      lines.push(`${date}:`);
      lines.push(...entries);
    }
    coachingLogsBlock = `\n\nRecent meal logs (from the app's food record):\n${lines.join('\n')}\n`;
  }

  return `${baseInfo}\n${machineFormats}
Tone & style:
- You're a nutritionist friend — professional but approachable, like chatting with a friend who studied nutrition.
- Use natural spoken language: moderate 语气词 in Chinese, contractions in English.
- Keep each reply focused — no filler, no repeating what the user said.
- NEVER include parenthetical meta-commentary or reveal your internal process. No progress updates, no phase labels, no invented features.
- Prefer natural, minimally processed, easy-to-buy foods. No cooking instructions unless asked.
${coachingLogsBlock}${coachingLogsBlock ? (() => {
  const todayLogs = (coachingLogs || []).filter((l: any) => {
    if (!l.timestamp) return false;
    const d = new Date(l.timestamp);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  });
  const eaten = todayLogs.reduce((a: any, l: any) => ({
    calories: a.calories + (l.calories || 0),
    protein: a.protein + (l.protein || 0),
    carbs: a.carbs + (l.carbs || 0),
    fat: a.fat + (l.fat || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  const remaining = {
    calories: targets.targetCalories - eaten.calories,
    protein: targets.macros.proteinG - eaten.protein,
    carbs: targets.macros.carbsG - eaten.carbs,
    fat: targets.macros.fatG - eaten.fat,
  };
  const todaySummary = todayLogs.length > 0
    ? `\nToday's intake so far: ${Math.round(eaten.calories)} kcal, P${Math.round(eaten.protein)}g, C${Math.round(eaten.carbs)}g, F${Math.round(eaten.fat)}g` +
      `\nRemaining budget: ~${Math.round(remaining.calories)} kcal, P${Math.round(remaining.protein)}g, C${Math.round(remaining.carbs)}g, F${Math.round(remaining.fat)}g`
    : '';
  return `**When meal log data is available (as shown above):**
The user already has recent meal records. Unless they explicitly ask to start fresh (e.g. "重新聊聊饮食习惯", "let's start over", "从头开始"), you should skip Phase 1 and use the log data directly.
${todaySummary}

**Mode A — Single meal recommendation (user asks for a specific meal, e.g. "推荐晚餐", "晚上吃什么", "帮我搭配午餐"):**
1. Briefly note what they've already eaten today and the remaining calorie/macro budget (1-2 sentences).
2. Recommend 3-5 food items for ONLY the requested meal, fitting within the remaining budget. Be specific with food names and portions.
3. Output a JSON plan block. ONLY fill the requested meal's key (e.g. "dinner"), set all other keys to empty arrays [].
\`\`\`json
{
  "title": "${language === 'zh' ? '晚餐推荐' : 'Dinner Recommendation'}",
  "description": "short summary",
  "breakfast": [], "lunch": [], "dinner": [{"category":"Prot|Veg|Carb|Fat|Drink|Fruit","name":"","serving":0,"unit":"g|ml","protein":0,"carbs":0,"fat":0,"calories":0}], "snack": [],
  "isOptimized": true
}
\`\`\`
4. After the plan, append: :::suggestions:::${language === 'zh' ? '记录到今天|我想调整' : 'Log to today|I want changes'}:::

**Mode B — General coaching with log data (user wants overall advice or a full-day plan):**
1. Briefly analyze their recent eating patterns — what's good, what's missing, any imbalances (2-3 sentences, conversational).
2. Directly provide a concrete one-day meal recommendation addressing the gaps you noticed.
3. Output the recommendation as a Phase 3 JSON plan block so the app can parse it.
   **CRITICAL: The plan MUST total ~${targets.targetCalories} kcal (±10%). This is the user's calculated daily target — do NOT deviate. Sum all items' calories and verify before outputting.**
4. After the plan, append: :::suggestions:::${language === 'zh' ? '保存计划|我想调整' : 'Save plan|I want changes'}:::

Only fall back to the full 3-phase flow below if the user explicitly wants to re-discuss their habits from scratch.
`;
})()
 : ''}Your coaching process has 3 phases. Phases MUST proceed in order: 1 → 2 → 3. You MUST NOT skip any phase.

**Phase 1: Information Collection**
Collect ALL 8 items below, one at a time in order. For each item, you need BOTH the content AND the timing/frequency. If the user only provides one aspect (e.g. only timing but not what they eat, or only food but not timing), follow up to get the missing info before moving on.
  1) Breakfast — what they typically eat AND roughly what time
  2) Lunch — what they typically eat AND roughly what time
  3) Dinner — what they typically eat AND roughly what time
  4) Snacks — any snacks/drinks between meals, what kind
  5) Sleep — bedtime, wake time, sleep quality
  6) Hydration — daily water intake amount
  7) Exercise — type, frequency, intensity
  8) Stress & emotional eating — any stress eating habits or cravings
- Ask exactly one question per turn. Naturally acknowledge the user's answer, then ask the next uncollected item or follow up for missing details. Do NOT combine multiple questions.
- IMPORTANT: The goal is to understand WHAT they eat, not just WHEN. If the user only tells you meal times without describing food content, you MUST follow up asking what they usually eat for that meal before moving on.
- CRITICAL: You MUST ask about ALL 8 items before moving to Phase 2. If the user says "skip", "no need", "先不用了", "不需要", "跳过" or similar for a specific item, mark it as skipped and immediately move to the NEXT uncollected item — do NOT jump to Phase 2. Only after all 8 items have been either answered or explicitly skipped can you proceed.
- Do NOT analyze, give advice, or generate a meal plan during this phase. No optimization suggestions, no diet tips.
- If user sends an image, acknowledge briefly and ask the next question. No nutritional analysis, no :::meal_log:::, no "已记录".
- If user mentions water intake, treat it as their hydration answer and continue.
- Keep a mental checklist: [1]Breakfast [2]Lunch [3]Dinner [4]Snacks [5]Sleep [6]Hydration [7]Exercise [8]Stress. Only proceed to Phase 2 when ALL are ✓ or explicitly skipped.

**Phase 2: Analysis & Optimization (MANDATORY — do NOT skip)**
ONLY enter this phase after ALL 8 items from Phase 1 have been answered or explicitly skipped by the user. If any item remains unasked, you are still in Phase 1 — go back and ask it. NEVER combine a Phase 1 question with Phase 2 suggestions in the same reply.
- Output 3-5 actionable optimization suggestions as a numbered list, each with a brief reason why.
- After listing suggestions, ask if the user wants a meal plan.
- Append: :::suggestions:::${language === 'zh' ? '开始生成|暂不生成' : 'Generate plan|Not now'}:::
- Do NOT output a meal plan in this phase. Wait for user confirmation.

**Phase 3: Plan Generation**
ONLY after Phase 2 is complete AND the user agrees to generate a plan:
- Provide a concrete one-day plan (Breakfast/Lunch/Dinner/Snack) with specific foods and portions.
- ALWAYS output ALL four meal sections in a single reply. NEVER split across multiple replies.
- If user requests adjustments (e.g. change calories, swap foods), regenerate the COMPLETE plan with all four meals, not just the modified part.
- **CRITICAL: Target ~${targets.targetCalories} kcal (±10%). This is the user's calculated daily target. Sum all items' calories and verify the total is within ${Math.round(targets.targetCalories * 0.9)}–${Math.round(targets.targetCalories * 1.1)} kcal before outputting.** If user explicitly requests a different calorie target, use their target instead.
- The sum of all items' calories in the JSON MUST approximately equal the total you state in your text.
- Include a JSON block for app parsing:
\`\`\`json
{
  "title": "Plan Name",
  "description": "short summary",
  "breakfast": [{"category":"Prot|Veg|Carb|Fat|Drink|Fruit","name":"","serving":0,"unit":"g|ml","protein":0,"carbs":0,"fat":0,"calories":0}],
  "lunch": [], "dinner": [], "snack": [],
  "isOptimized": true
}
\`\`\`
- The JSON MUST include EVERY food and drink item from the text plan. Beverages (coffee, milk, water, etc.) and small items (seeds, nuts) count as items. Combine all non-main-meal items (afternoon tea, late-night snack, etc.) into "snack".
- After presenting the plan, append: :::suggestions:::${language === 'zh' ? '保存计划|我想调整' : 'Save plan|I want changes'}:::
`;
}

function historyToChatMessages(history: ChatMessage[]) {
  return history.map(msg => ({
    role: msg.role === 'model' ? 'assistant' : 'user',
    content: msg.text,
  }));
}

function extractTextFromQwenResponse(payload: any): string {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text;
  if (typeof payload?.choices?.[0]?.message?.content === 'string') return payload.choices[0].message.content;
  if (Array.isArray(payload?.choices?.[0]?.message?.content)) {
    return payload.choices[0].message.content
      .map((item: any) => item?.text || item?.content || '')
      .join('\n')
      .trim();
  }
  if (Array.isArray(payload?.output)) {
    const text = payload.output
      .flatMap((item: any) => item?.content || [])
      .map((content: any) => content?.text || content?.content || '')
      .filter(Boolean)
      .join('\n')
      .trim();
    if (text) return text;
  }
  return '';
}

const AI_REQUEST_TIMEOUT_MS = 60_000;
const AI_MAX_RETRIES = 2;
const AI_RETRY_BASE_DELAY_MS = 1000;

function isRetryableError(error: any): boolean {
  if (!error) return false;
  const msg = String(error.message || error).toLowerCase();
  return (
    msg.includes('load failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('aborted') ||
    msg.includes('timeout')
  );
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = AI_REQUEST_TIMEOUT_MS,
  externalSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      if (externalSignal?.aborted) throw new DOMException('Aborted', 'AbortError');
      throw new Error(`请求超时（${Math.round(timeoutMs / 1000)}s）`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

async function requestWithRetry(
  provider: 'qwen' | 'ark',
  baseUrl: string,
  apiKey: string,
  path: string,
  body: any,
  options?: { signal?: AbortSignal; timeoutMs?: number; maxRetries?: number },
): Promise<any> {
  const model = body?.model || 'unknown-model';
  const maxRetries = options?.maxRetries ?? AI_MAX_RETRIES;
  const timeoutMs = options?.timeoutMs ?? AI_REQUEST_TIMEOUT_MS;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (options?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    if (attempt > 0) {
      const delay = AI_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.info(`[ai-retry] ${provider} attempt ${attempt + 1}/${maxRetries + 1} after ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }

    const startMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      const response = await fetchWithTimeout(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      }, timeoutMs, options?.signal);

      const payload = await response.json().catch(() => ({}));
      const elapsedMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs);

      if (ENABLE_AI_LATENCY_LOG) {
        console.info('[ai-latency]', {
          provider,
          path,
          model,
          status: response.status,
          ok: response.ok,
          elapsedMs,
          attempt: attempt + 1,
        });
      }

      if (!response.ok) {
        const message = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
        const err = new Error(message);
        if (response.status >= 500 && attempt < AI_MAX_RETRIES) {
          lastError = err;
          continue;
        }
        throw err;
      }
      return payload;
    } catch (error: any) {
      const elapsedMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs);
      if (ENABLE_AI_LATENCY_LOG) {
        console.warn('[ai-latency] request failed', { provider, path, model, elapsedMs, attempt: attempt + 1, error: error?.message });
      }
      lastError = error;
      if (error?.name === 'AbortError' || !isRetryableError(error) || attempt >= maxRetries) {
        throw error;
      }
    }
  }
  throw lastError || new Error('Request failed after retries');
}

type RequestOptions = { signal?: AbortSignal; timeoutMs?: number; maxRetries?: number };

async function requestQwen(path: string, body: any, options?: RequestOptions) {
  return requestWithRetry('qwen', DASHSCOPE_BASE_URL, dashscopeApiKey, path, body, options);
}

async function requestArk(path: string, body: any, options?: RequestOptions) {
  return requestWithRetry('ark', ARK_BASE_URL, arkApiKey, path, body, options);
}

async function requestChatCompletions(provider: Provider, body: any, options?: RequestOptions) {
  return provider === 'ark'
    ? requestArk('/chat/completions', body, options)
    : requestQwen('/chat/completions', body, options);
}

function resolveRoute(image: boolean): { provider: Provider; model: string } | undefined {
  const hasQwen = Boolean(dashscopeApiKey);
  const hasArk = Boolean(arkApiKey);

  if (image) {
    if (VISION_PROVIDER === 'ark' && hasArk && ARK_VISION_MODEL) {
      return { provider: 'ark', model: ARK_VISION_MODEL };
    }
    if (hasQwen) {
      return { provider: 'qwen', model: QWEN_VISION_MODEL };
    }
    if (hasArk && ARK_VISION_MODEL) {
      return { provider: 'ark', model: ARK_VISION_MODEL };
    }
    return undefined;
  }

  if (TEXT_PROVIDER === 'ark' && hasArk) {
    return { provider: 'ark', model: ARK_TEXT_MODEL };
  }
  if (TEXT_PROVIDER === 'qwen' && hasQwen) {
    return { provider: 'qwen', model: QWEN_TEXT_MODEL };
  }
  if (hasArk) {
    return { provider: 'ark', model: ARK_TEXT_MODEL };
  }
  if (hasQwen) {
    return { provider: 'qwen', model: QWEN_TEXT_MODEL };
  }
  return undefined;
}

function parseJsonCandidate(text: string): any | undefined {
  if (!text) return undefined;
  const whole = text.trim();
  const fenced = whole.match(/```json\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  const firstJson = whole.match(/\{[\s\S]*\}/)?.[0]?.trim();
  const candidates = [whole, fenced, firstJson].filter(Boolean) as string[];
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch (_) {
      // try next
    }
  }
  return undefined;
}

export async function detectInteractionIntent(params: {
  language: 'en' | 'zh';
  userText: string;
  hasImage?: boolean;
  recentAssistantText?: string;
}): Promise<InteractionIntentResult | undefined> {
  const route = resolveRoute(false);
  if (!route) return undefined;
  const { language, userText, hasImage, recentAssistantText } = params;

  const prompt =
    language === 'zh'
      ? `你是意图分类器。请把用户输入分类为一个交互场景，并判断是否在要求“记入饮食记录”。
只输出 JSON，不要解释：
{"scene":"meal_estimate|diet_coaching|record_analysis","recordIntent":true|false}
判定规则（中文优先语义，不靠关键词）：
- meal_estimate: 单餐/单个食物识别、营养估算、吃了什么。
- diet_coaching: 饮食教练连续流程（信息收集→分析→计划生成）；也包括基于已有饮食记录推荐某一餐（如"推荐晚餐"、"晚上吃什么好"、"帮我搭配午餐"）。
- record_analysis: 仅限对已有饮食记录的回顾分析（如"今天吃得怎么样"、"帮我看看营养够不够"），不包括推荐具体餐食。
- recordIntent=true: 用户希望记录进食。这是饮食记录App，以下都视为recordIntent=true：说了吃了/喝了(如喝了酸奶)；只说食物名(如酸奶、鸡蛋、苹果)等同于报告进食；食物+份量(如酸奶150克)；要求记录(如记一下)。
输入上下文：
user="${userText}"
hasImage=${hasImage ? 'true' : 'false'}
recentAssistant="${recentAssistantText || ''}"` 
      : `You are an intent classifier. Classify user input and decide if they want to save this intake to food log.
Output strict JSON only:
{"scene":"meal_estimate|diet_coaching|record_analysis","recordIntent":true|false}
Rules:
- meal_estimate: single meal/food estimate.
- diet_coaching: coaching flow (collect -> analyze -> plan generation); also includes recommending a specific meal based on existing records (e.g. "recommend dinner", "what should I eat tonight").
- record_analysis: only for reviewing/analyzing existing records (e.g. "how did I eat today"), NOT for recommending specific meals.
- recordIntent=true: user wants intake logged. This is a food tracking app, so ALL imply recordIntent=true: eating phrases (ate yogurt); bare food names (yogurt, eggs, apple) = reporting intake; food+quantity (yogurt 150g); record requests (log this).
Context:
user="${userText}"
hasImage=${hasImage ? 'true' : 'false'}
recentAssistant="${recentAssistantText || ''}"`;

  try {
    const payload = await requestChatCompletions(route.provider, {
      model: route.model,
      temperature: 0,
      messages: [
        { role: 'system', content: prompt },
      ],
    });
    const text = extractTextFromQwenResponse(payload);
    const parsed = parseJsonCandidate(text);
    if (!parsed) return undefined;
    if (!['meal_estimate', 'diet_coaching', 'record_analysis'].includes(parsed.scene)) return undefined;
    return {
      scene: parsed.scene as InteractionScene,
      recordIntent: Boolean(parsed.recordIntent),
    };
  } catch (error) {
    console.warn('detectInteractionIntent failed', error);
    return undefined;
  }
}

export async function sendMessageToAI(
  history: ChatMessage[], 
  newMessage: string, 
  userContext: any,
  images?: string[]
): Promise<{ text: string; mealPlan?: MealPlan; correctedUserText?: string; suggestions?: string[]; mealLog?: MealLogPayload }> {
  const language = userContext.language || 'en' as 'en' | 'zh';
  const hasImages = images && images.length > 0;
  try {
    await ensureFoodDatabaseLoaded();
    const route = resolveRoute(Boolean(hasImages));
    if (!route) {
      return {
        text:
          language === 'zh'
            ? '当前未配置可用模型 API Key。请先配置 `ARK_API_KEY`（推荐）或 `DASHSCOPE_API_KEY`，然后刷新页面。'
            : 'No available model API key configured. Please set `ARK_API_KEY` (recommended) or `DASHSCOPE_API_KEY`, then refresh.',
      };
    }

    const systemPrompt = buildSystemPrompt(userContext, language, history, newMessage || '');
    let responseText = '';

    const scene = (userContext?.interactionScene as InteractionScene) || 'diet_coaching';
    const maxTokens = scene === 'meal_estimate' ? (hasImages && images.length > 1 ? 2048 : 1024) : 4096;

    const userContent = hasImages
      ? [
          ...images.map(img => ({ type: 'image_url' as const, image_url: { url: img } })),
          { type: 'text' as const, text: newMessage || (language === 'zh' ? `请逐一分析这${images.length > 1 ? `${images.length}张` : '张'}图片中的食物。` : `Please analyze the food in ${images.length > 1 ? `these ${images.length} images` : 'this image'}.`) },
        ]
      : (newMessage || (language === 'zh' ? '请继续。' : 'Please continue.'));

    const completionPayload = await requestChatCompletions(route.provider, {
      model: route.model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        ...(scene === 'meal_estimate' ? [] : historyToChatMessages(history)),
        { role: 'user', content: userContent },
      ],
    });
    responseText = extractTextFromQwenResponse(completionPayload);
    const finishReason = completionPayload?.choices?.[0]?.finish_reason;
    if (ENABLE_AI_LATENCY_LOG) {
      console.info('[ai-response]', {
        finishReason,
        responseLength: responseText.length,
        responsePreview: responseText.slice(0, 500),
        hasMealLog: /:::meal_log/i.test(responseText),
        scene,
      });
    }

    responseText = responseText || "Sorry, I couldn't process that.";
    let correctedUserText: string | undefined;
    let suggestions: string[] | undefined;
    let mealLog: MealLogPayload | undefined;

    // Parse corrected user input - more robust regex
    const correctionMatch = responseText.match(/:::corrected_input[:\s]*([\s\S]*?)\s*:::/i);
    if (correctionMatch) {
      correctedUserText = correctionMatch[1].trim();
      responseText = responseText.replace(correctionMatch[0], '').trim();
    }

    // Parse suggestions - more robust regex to handle variations in colons and whitespace
    const suggestionsMatch = responseText.match(/:::suggestions[:\s]*([\s\S]*?)\s*:::/i);
    if (suggestionsMatch) {
      suggestions = suggestionsMatch[1].split('|').map(s => s.trim()).filter(Boolean);
      responseText = responseText.replace(suggestionsMatch[0], '').trim();
    }

    const mealLogMatch = responseText.match(/:::meal_log[:\s]*([\s\S]*?)\s*:::/i);
    if (mealLogMatch?.[1]) {
      try {
        const parsed = JSON.parse(mealLogMatch[1].trim());
        if (parsed && Array.isArray(parsed.items)) {
          parsed.items = enrichMealLogItems(parsed.items);
          // Learn unmatched foods in background (don't block response)
          learnUnmatchedFoods(parsed.items, language).catch(() => {});
          mealLog = parsed as MealLogPayload;
        }
      } catch (e) {
        console.warn('Failed to parse meal_log payload', e);
      }
    }
    // Strip ALL meal_log blocks from display text
    responseText = responseText.replace(/:::meal_log[:\s]*[\s\S]*?:::/gi, '').trim();
    
    // Parse meal plan whenever possible to maximize tolerance for model output variance.
    const mealPlan = parseMealPlanFromText(responseText);

    if (mealPlan) {
      mealPlan.breakfast = enrichPlanFoodItems(mealPlan.breakfast);
      mealPlan.lunch = enrichPlanFoodItems(mealPlan.lunch);
      mealPlan.dinner = enrichPlanFoodItems(mealPlan.dinner);
      mealPlan.snack = enrichPlanFoodItems(mealPlan.snack);

      const targets = computeNutritionTargets(userContext);
      const allItems = [
        ...mealPlan.breakfast, ...mealPlan.lunch,
        ...mealPlan.dinner, ...mealPlan.snack,
      ];
      const totalCal = allItems.reduce((s, i) => s + (i.calories || 0), 0);
      if (totalCal > 0 && Math.abs(totalCal - targets.targetCalories) / targets.targetCalories > 0.15) {
        const ratio = targets.targetCalories / totalCal;
        const scale = (items: PlanFoodItem[]) => items.map(item => ({
          ...item,
          serving: Math.round(item.serving * ratio * 10) / 10,
          protein: Math.round(item.protein * ratio),
          carbs: Math.round(item.carbs * ratio),
          fat: Math.round(item.fat * ratio),
          calories: Math.round(item.calories * ratio),
        }));
        mealPlan.breakfast = scale(mealPlan.breakfast);
        mealPlan.lunch = scale(mealPlan.lunch);
        mealPlan.dinner = scale(mealPlan.dinner);
        mealPlan.snack = scale(mealPlan.snack);

        const newTotal = Math.round(targets.targetCalories);
        responseText = responseText.replace(
          /(?:总热量|总计|合计|热量).{0,6}?约?\s*(\d{3,5})\s*(?:大卡|千卡|kcal|卡)/gi,
          (match, oldNum) => match.replace(oldNum, String(newTotal))
        );
        responseText = responseText.replace(
          /(?:total|about|approximately)\s*~?\s*(\d{3,5})\s*kcal/gi,
          (match, oldNum) => match.replace(oldNum, String(newTotal))
        );
      }
    }
    
    return { text: responseText, mealPlan, correctedUserText, suggestions, mealLog };
  } catch (error: any) {
    console.error("AI Error:", error);
    const detail = error?.message || String(error);
    return {
      text:
        language === 'zh'
          ? `AI 服务连接失败：${detail}`
          : `Connection failed: ${detail}`,
    };
  }
}

/**
 * For meal log items that don't match the food database, use a text AI call
 * to estimate per-100g nutrition with thorough reasoning, then save to the
 * custom food database for future direct matching.
 * Runs in the background — does not block the main response.
 */
async function learnUnmatchedFoods(
  items: MealLogPayloadItem[],
  language: 'en' | 'zh'
): Promise<void> {
  const unmatched = items.filter(item => {
    const matches = searchFood(item.name, 1);
    return matches.length === 0;
  });

  if (unmatched.length === 0) return;

  const route = resolveRoute(false);
  if (!route) return;

  const names = unmatched.map(item => item.name).join('、');

  const prompt = language === 'zh'
    ? `你是营养学专家。请估算以下食物每100克（或100毫升）的平均营养成分。
食物：${names}

对于混合食物（如沙拉碗、水果拼盘），请先推理典型成分和比例，再计算加权平均值。
对于饮品（如咖啡含奶），按每100毫升计算。

严格只输出 JSON 数组，不要任何解释：
[{"name":"食物名","kcal":0,"protein":0,"fat":0,"carbs":0,"fiber":0}]
所有数值为每100g（或100ml）的含量，保留1位小数。`
    : `You are a nutrition expert. Estimate per-100g (or per-100ml) average nutrition for these foods:
Foods: ${names}

For mixed foods (e.g. salad bowl, fruit platter), reason about typical components and proportions, then compute weighted averages.
For beverages, calculate per 100ml.

Output strict JSON array only:
[{"name":"food name","kcal":0,"protein":0,"fat":0,"carbs":0,"fiber":0}]
All values per 100g/100ml, 1 decimal place.`;

  try {
    const payload = await requestChatCompletions(route.provider, {
      model: route.model,
      temperature: 0,
      max_tokens: 512,
      messages: [{ role: 'system', content: prompt }],
    });

    const text = extractTextFromQwenResponse(payload);
    const results = parseJsonCandidate(text);
    if (!Array.isArray(results)) return;

    for (const item of results) {
      if (!item.name || typeof item.kcal !== 'number') continue;
      addCustomFood({
        foodName: item.name,
        energyKCal: item.kcal,
        protein: item.protein || 0,
        fat: item.fat || 0,
        carbs: item.carbs || 0,
        dietaryFiber: item.fiber || 0,
      });
    }

    if (ENABLE_AI_LATENCY_LOG) {
      console.info('[food-learn]', {
        learned: results.map((r: any) => r.name),
        count: results.length,
      });
    }
  } catch (error) {
    console.warn('learnUnmatchedFoods failed', error);
  }
}

const AI_ESTIMATE_TIMEOUT_MS = 10_000;
const AI_ESTIMATE_MAX_RETRIES = 0;

export async function estimateNutritionByAI(
  foodName: string,
  language: 'en' | 'zh',
  signal?: AbortSignal,
): Promise<{ kcal: number; protein: number; fat: number; carbs: number; fiber: number } | null> {
  const route = resolveRoute(false);
  if (!route) return null;

  const prompt = language === 'zh'
    ? `你是营养学专家。请估算"${foodName}"每100克（或100毫升）的平均营养成分。
重要：这是日常饮食记录场景，除非名称明确含有"干""脱水""生"等字样，否则一律按新鲜或常见烹饪后的状态估算（如青豆=鲜青豆，玉米粒=鲜玉米粒，鸡胸肉=熟鸡胸肉）。
对于混合食物请推理典型成分比例后计算加权平均。
严格只输出一个 JSON 对象：{"kcal":0,"protein":0,"fat":0,"carbs":0,"fiber":0}
所有数值保留1位小数。不要任何解释。`
    : `You are a nutrition expert. Estimate per-100g (or per-100ml) average nutrition for "${foodName}".
Important: This is for daily meal logging. Unless the name explicitly says "dried", "raw", or "dehydrated", always estimate for the fresh or commonly cooked form (e.g. green peas = fresh, corn kernels = fresh, chicken breast = cooked).
For mixed foods, reason about typical components and compute weighted averages.
Output strict JSON only: {"kcal":0,"protein":0,"fat":0,"carbs":0,"fiber":0}
All values 1 decimal place. No explanation.`;

  try {
    const payload = await requestChatCompletions(route.provider, {
      model: route.model,
      temperature: 0,
      max_tokens: 100,
      messages: [{ role: 'system', content: prompt }],
    }, { signal, timeoutMs: AI_ESTIMATE_TIMEOUT_MS, maxRetries: AI_ESTIMATE_MAX_RETRIES });

    const text = extractTextFromQwenResponse(payload);
    const result = parseJsonCandidate(text);
    if (result && typeof result.kcal === 'number') {
      addCustomFood({
        foodName,
        energyKCal: result.kcal,
        protein: result.protein || 0,
        fat: result.fat || 0,
        carbs: result.carbs || 0,
        dietaryFiber: result.fiber || 0,
      });
      return result;
    }
  } catch (error: any) {
    if (error?.name === 'AbortError') throw error;
    console.warn('estimateNutritionByAI failed', error);
  }
  return null;
}

function parseMealLogFromText(text: string): MealLogPayload | undefined {
  if (!text) return undefined;

  const tagged = text.match(/:::meal_log[:\s]*([\s\S]*?)\s*:::/i)?.[1]?.trim();
  const parsed = parseJsonCandidate(tagged || text);
  if (parsed && Array.isArray(parsed.items)) {
    return parsed as MealLogPayload;
  }

  return undefined;
}

export async function extractMealLogForRecord(
  params: {
    language: 'en' | 'zh';
    userText: string;
    recentAssistantText?: string;
    image?: string;
  }
): Promise<MealLogPayload | undefined> {
  const { language, userText, recentAssistantText } = params;
  await ensureFoodDatabaseLoaded();
  const route = resolveRoute(false);
  if (!route) return undefined;

  const parserPrompt =
    language === 'zh'
      ? `你是一个饮食记录解析器。根据助手的食物分析文本，提取结构化饮食记录。
严格只输出 JSON，不要任何解释，不要 markdown。
格式：
{"mealType":"breakfast|lunch|dinner|snack","items":[{"category":"Prot|Veg|Carb|Fat|Drink|Fruit","name":"","serving":0,"unit":"g","protein":0,"carbs":0,"fat":0,"calories":0}]}
要求：
- 包含分析中提到的所有食物和饮品，不要遗漏。
- 包含所有食物，不要遗漏。
- 数值给出合理估算，必须是数字。
- serving必须是去皮去壳去骨后的可食部分重量，使用保守合理的单份估算，不要高估。
- mealType：根据上下文推断（如"早餐"→breakfast，"午饭"→lunch，"晚餐"→dinner，"下午茶/宵夜"→snack）。无法判断时可省略。`
      : `You are a meal-log parser. Extract structured meal log from the assistant's food analysis text.
Output strict JSON only (no markdown, no explanation):
{"mealType":"breakfast|lunch|dinner|snack","items":[{"category":"Prot|Veg|Carb|Fat|Drink|Fruit","name":"","serving":0,"unit":"g","protein":0,"carbs":0,"fat":0,"calories":0}]}
Rules:
- Include ALL foods and drinks mentioned in the analysis.
- Include ALL foods, do not skip any item.
- Numeric fields must be numbers with realistic estimates.
- Serving must be edible portion only (no peel/shell/bone). Use conservative, realistic single-serving estimates. Do NOT overestimate.
- mealType: infer from context (e.g. "breakfast"→breakfast, "lunch"→lunch, "dinner"→dinner, "afternoon tea/late night"→snack). Omit if unclear.`;

  try {
    const userContextText = [
      `User request: ${userText || ''}`,
      recentAssistantText ? `Recent assistant analysis: ${recentAssistantText}` : '',
    ].filter(Boolean).join('\n');

    const payload = await requestChatCompletions(route.provider, {
      model: route.model,
      messages: [
        { role: 'system', content: parserPrompt },
        { role: 'user', content: userContextText },
      ],
    });

    const text = extractTextFromQwenResponse(payload);
    const parsed = parseMealLogFromText(text);
    if (parsed && Array.isArray(parsed.items)) {
      parsed.items = enrichMealLogItems(parsed.items);
      learnUnmatchedFoods(parsed.items, language).catch(() => {});
    }
    return parsed;
  } catch (error) {
    console.warn('extractMealLogForRecord failed', error);
    return undefined;
  }
}

export function parseMealPlanFromText(text: string): MealPlan | undefined {
  const toMealPlan = (parsed: any): MealPlan | undefined => {
    if (!parsed || (!parsed.breakfast && !parsed.lunch && !parsed.dinner && !parsed.snack)) {
      return undefined;
    }
    // Add UUIDs to items if missing (AI won't generate them)
    const enrich = (items: any[]) => items?.map(i => ({ ...i, id: uuidv4() })) || [];
    return {
      title: parsed.title,
      description: parsed.description,
      breakfast: enrich(parsed.breakfast),
      lunch: enrich(parsed.lunch),
      dinner: enrich(parsed.dinner),
      snack: enrich(parsed.snack),
      isOptimized: parsed.isOptimized || false,
    };
  };

  try {
    // 1) Try robust candidate parsing from full text first.
    const directParsed = parseJsonCandidate(text);
    const directMealPlan = toMealPlan(directParsed);
    if (directMealPlan) return directMealPlan;

    // 2) Fallback: iterate all fenced blocks and parse each.
    const fencedBlocks = Array.from(text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi))
      .map(m => m[1]?.trim())
      .filter(Boolean) as string[];
    for (const block of fencedBlocks) {
      const parsed = parseJsonCandidate(block);
      const mealPlan = toMealPlan(parsed);
      if (mealPlan) return mealPlan;
    }
  } catch (e) {
    console.error("Failed to parse meal plan JSON", e);
  }
  return undefined;
}
