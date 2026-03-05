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

function computeNutritionTargets(userContext: any) {
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
Include EVERY food item. Do NOT skip any. Infer mealType from context (e.g. "早餐"→breakfast, "午饭"→lunch, "晚餐"→dinner, "下午茶/宵夜"→snack). If unclear, omit mealType.` : ''}
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

  return `${baseInfo}\n${machineFormats}
Tone & style:
- You're a nutritionist friend — professional but approachable, like a friend who studied nutrition.
- Use natural spoken language: moderate 语气词 in Chinese, contractions in English. Keep it grounded and real.
- When giving optimization suggestions (Phase 2), briefly explain *why* (1 short reason) so the user learns.
- Show you care naturally: acknowledge effort ("这顿搭配得不错"), empathize with struggles ("馋奶茶太正常了"). Don't overdo it.
- Keep each reply focused — no filler, no repeating what the user said.
- NEVER reveal your internal workflow, phases, or reasoning process to the user. No meta-commentary like "我们先收集信息再分析" or "(按顺序来)". Just ask naturally.
- Prefer natural, minimally processed, easy-to-buy foods. No cooking instructions unless asked.

Your coaching process has 3 phases. Phases MUST proceed in order: 1 → 2 → 3. You MUST NOT skip any phase.

**Phase 1: Information Collection**
Collect these 8 items one at a time, in natural conversational style:
  1) breakfast  2) lunch  3) dinner  4) snacks
  5) sleep  6) hydration  7) exercise  8) stress & emotional eating
- Ask exactly one question per turn. The reply should ONLY contain the question, nothing else.
- Do NOT add any parenthetical explanation after the question. BAD: "那午餐吃什么？（这样能了解你的饮食节奏）" GOOD: "那午餐一般吃什么呀？"
- Do NOT reveal this checklist or your collection progress to the user.
- Do NOT analyze, give advice, or generate a meal plan during this phase.

**Phase 2: Analysis & Optimization (MANDATORY — do NOT skip)**
ONLY after the user has ANSWERED all 8 items above, transition to this phase. "Collecting" means the user replied with the information, not just that you asked the question. NEVER combine a Phase 1 question with Phase 2 suggestions in the same reply.
- You MUST complete this phase before generating any meal plan.
- Output 3-5 specific, actionable optimization suggestions as a numbered list.
- Each suggestion: 1-2 sentences (≤60 characters in Chinese / ≤25 words in English). Include a brief reason why. No bold titles.
- After listing ALL suggestions, ask if the user wants a meal plan.
- Append: :::suggestions:::${language === 'zh' ? '开始生成|暂不生成' : 'Generate plan|Not now'}:::
- Do NOT output a meal plan in this phase. Wait for user confirmation.

**Phase 3: Plan Generation**
ONLY after Phase 2 is complete AND the user agrees to generate a plan:
- Provide a concrete one-day plan (Breakfast/Lunch/Dinner/Snack) with specific foods and portions.
- ALWAYS output ALL four meal sections in a single reply. NEVER split across multiple replies.
- If user requests adjustments (e.g. change calories, swap foods), regenerate the COMPLETE plan with all four meals, not just the modified part.
- Target ~${targets.targetCalories} kcal (±10%). If user explicitly requests a different calorie target, use their target instead.
- IMPORTANT: The sum of all items' calories in the JSON MUST approximately equal the total you state in your text. Double-check before outputting.
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

async function requestQwen(path: string, body: any) {
  const startMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const model = body?.model || 'unknown-model';
  const response = await fetch(`${DASHSCOPE_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${dashscopeApiKey}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  const elapsedMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs);

  if (ENABLE_AI_LATENCY_LOG) {
    console.info('[ai-latency]', {
      provider: 'qwen',
      path,
      model,
      status: response.status,
      ok: response.ok,
      elapsedMs,
    });
  }

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

async function requestArk(path: string, body: any) {
  const startMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const model = body?.model || 'unknown-model';
  const response = await fetch(`${ARK_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${arkApiKey}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  const elapsedMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs);

  if (ENABLE_AI_LATENCY_LOG) {
    console.info('[ai-latency]', {
      provider: 'ark',
      path,
      model,
      status: response.status,
      ok: response.ok,
      elapsedMs,
    });
  }

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

async function requestChatCompletions(provider: Provider, body: any) {
  return provider === 'ark'
    ? requestArk('/chat/completions', body)
    : requestQwen('/chat/completions', body);
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
- diet_coaching: 饮食教练连续流程（信息收集→分析→计划生成）。
- record_analysis: 对每日/每周已有饮食记录做阶段性回顾分析。
- recordIntent=true: 用户希望把这次进食写入记录（即使说法很口语，如“喝了酸奶”“记一下这个”）。
输入上下文：
user="${userText}"
hasImage=${hasImage ? 'true' : 'false'}
recentAssistant="${recentAssistantText || ''}"` 
      : `You are an intent classifier. Classify user input and decide if they want to save this intake to food log.
Output strict JSON only:
{"scene":"meal_estimate|diet_coaching|record_analysis","recordIntent":true|false}
Rules:
- meal_estimate: single meal/food estimate.
- diet_coaching: coaching flow (collect -> analyze -> plan generation).
- record_analysis: periodic analysis for existing daily/weekly records.
- recordIntent=true when user wants this intake logged, even colloquial wording.
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
  image?: string // Base64 string
): Promise<{ text: string; mealPlan?: MealPlan; correctedUserText?: string; suggestions?: string[]; mealLog?: MealLogPayload }> {
  const language = userContext.language || 'en' as 'en' | 'zh';
  try {
    await ensureFoodDatabaseLoaded();
    const route = resolveRoute(Boolean(image));
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
    const maxTokens = scene === 'meal_estimate' ? 1024 : 4096;

    const completionPayload = await requestChatCompletions(route.provider, {
      model: route.model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        ...(scene === 'meal_estimate' ? [] : historyToChatMessages(history)),
        {
          role: 'user',
          content: image
            ? [
                { type: 'image_url', image_url: { url: image } },
                { type: 'text', text: newMessage || (language === 'zh' ? '请分析这张图片。' : 'Please analyze this image.') },
              ]
            : (newMessage || (language === 'zh' ? '请继续。' : 'Please continue.')),
        },
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
- mealType：根据上下文推断（如"早餐"→breakfast，"午饭"→lunch，"晚餐"→dinner，"下午茶/宵夜"→snack）。无法判断时可省略。`
      : `You are a meal-log parser. Extract structured meal log from the assistant's food analysis text.
Output strict JSON only (no markdown, no explanation):
{"mealType":"breakfast|lunch|dinner|snack","items":[{"category":"Prot|Veg|Carb|Fat|Drink|Fruit","name":"","serving":0,"unit":"g","protein":0,"carbs":0,"fat":0,"calories":0}]}
Rules:
- Include ALL foods and drinks mentioned in the analysis.
- Include ALL foods, do not skip any item.
- Numeric fields must be numbers with realistic estimates.
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
