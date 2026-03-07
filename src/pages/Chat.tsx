import { useState, useRef, useEffect } from 'react';
import { useApp, MealItem, PlanTemplate } from '../context/AppContext';
import { sendMessageToAI, ChatMessage, MealLogPayload, extractMealLogForRecord, InteractionScene, detectInteractionIntent } from '../services/ai';
import { Send, Mic, Camera, X, ChefHat, Keyboard, Menu, Trash2 } from 'lucide-react';
import { startRealtimeASR } from '../services/speechRecognition';
import { startRecording, type PushToTalkController } from '../services/pushToTalk';
import { motion, AnimatePresence } from 'motion/react';

import SaveMealPlanModal from '../components/SaveMealPlanModal';
import { VoiceWaveform } from '../components/VoiceWaveform';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { v4 as uuidv4 } from 'uuid';
import { getRandomPlanColor } from '../data/mealPlans';
import { translations } from '../translations';


export default function Chat() {
  const { user, mealPlan: currentMealPlan, setMealPlan, addLogs, clearLogs, saveMealPlan, chatMessages: messages, setChatMessages: setMessages, allPlans, dailyLogs, setSavedAdvice, language, addWater, todayWaterTotal } = useApp();
  const t = translations[language];
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isStartingListening, setIsStartingListening] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const pttRef = useRef<PushToTalkController | null>(null);
  const pttPromiseRef = useRef<Promise<PushToTalkController> | null>(null);
  const recordingRef = useRef(false);
  const [inputMode, setInputMode] = useState<'voice' | 'text'>(() => {
    return (localStorage.getItem('diet_input_mode') as 'voice' | 'text') || 'voice';
  });
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [interimInput, setInterimInput] = useState('');
  const [lastSavedPlanId, setLastSavedPlanId] = useState<string | null>(null);
  const lastSavedPlanHashRef = useRef<string | null>(null);
  const [pendingPlanToSave, setPendingPlanToSave] = useState<PlanTemplate | null>(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const asrSessionRef = useRef<{ stop: () => Promise<string>; flush: () => Promise<string> } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const forcedSceneRef = useRef<InteractionScene | null>(null);
  const startedModeRef = useRef<InteractionScene | null>(null);
  const showQuickModeAfterReplyRef = useRef(false);
  const [showQuickModeButtons, setShowQuickModeButtons] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  
  // Batching Refs
  const pendingMessagesRef = useRef<string[]>([]);
  const batchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingImagesRef = useRef<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  // Cleanup ASR on unmount to release microphone
  useEffect(() => {
    return () => {
      asrSessionRef.current?.stop();
      asrSessionRef.current = null;
    };
  }, []);

  const switchInputMode = (mode: 'voice' | 'text') => {
    setInputMode(mode);
    localStorage.setItem('diet_input_mode', mode);
    if (mode === 'text' && (isListening || isStartingListening)) {
      asrSessionRef.current?.stop();
      asrSessionRef.current = null;
      setIsListening(false);
      setIsStartingListening(false);
      setInterimInput('');
    }
  };

  const scrollToBottom = (instant = false) => {
    messagesEndRef.current?.scrollIntoView({ 
      behavior: instant ? "auto" : "smooth" 
    });
  };

  const normalizeMessageText = (text: string) => {
    return text
      .replace(/\\?<br\s*\/?>/gi, '\n')
      .replace(/&lt;br\s*\/?&gt;/gi, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  const isAiServiceErrorText = (text: string) => {
    const normalized = normalizeMessageText(text || '').toLowerCase();
    if (!normalized) return false;
    return (
      /ai 服务当前连接失败|连接失败|请稍后重试|no available model api key configured|i'm having trouble connecting right now|please try again/i
        .test(normalized)
    );
  };


  const shouldShowSuggestions = (msg: ChatMessage) => {
    return msg.suggestions != null && msg.suggestions.length > 0;
  };

  const hasPlanDraftInText = (text: string) => {
    const normalized = normalizeMessageText(text || '');
    if (!normalized) return false;
    const mealSectionPatterns = [
      /(早餐|breakfast)/i,
      /(午餐|lunch)/i,
      /(晚餐|dinner)/i,
      /(加餐|snack)/i,
      /(第一餐|第二餐|第三餐|第四餐|meal\s*1|meal\s*2|meal\s*3|meal\s*4)/i,
    ];
    const matched = mealSectionPatterns.filter(p => p.test(normalized)).length;
    // Require at least 2 meal sections to consider it a concrete plan draft.
    return matched >= 2;
  };

  const formatMealLine = (item: any, lang: 'zh' | 'en') => {
    const name = String(item?.name || '').trim();
    if (!name) return '';
    const serving = Number(item?.serving) || 0;
    const unit = String(item?.unit || (lang === 'zh' ? 'g' : 'g'));
    if (serving > 0) return `${name}${lang === 'zh' ? `${Math.round(serving)}${unit}` : ` ${Math.round(serving)}${unit}`}`;
    return name;
  };

  const renderMealPlanText = (plan: any, lang: 'zh' | 'en') => {
    const section = (titleZh: string, titleEn: string, list: any[]) => {
      const items = Array.isArray(list) ? list : [];
      if (items.length === 0) return '';
      const lines = items.map((it: any) => formatMealLine(it, lang)).filter(Boolean);
      if (lines.length === 0) return '';
      return `${lang === 'zh' ? titleZh : titleEn}：${lines.join(lang === 'zh' ? '、' : ', ')}`;
    };

    const blocks = [
      section('早餐', 'Breakfast', plan?.breakfast),
      section('午餐', 'Lunch', plan?.lunch),
      section('晚餐', 'Dinner', plan?.dinner),
      section('加餐', 'Snack', plan?.snack),
    ].filter(Boolean);
    if (blocks.length === 0) return '';

    const title = String(plan?.title || '').trim();
    const titleLine = title ? (lang === 'zh' ? `一日计划：${title}` : `One-day plan: ${title}`) : '';
    return [titleLine, ...blocks].filter(Boolean).join('\n');
  };

  const buildTemplateFromMealPlan = (plan: any): { template: PlanTemplate; planHash: string } => {
    const planItems: Omit<MealItem, 'id' | 'timestamp'>[] = [];
    const collectItems = (items: any[], type: MealItem['type']) => {
      (items || []).forEach(item => {
        planItems.push({
          planId: item.id || uuidv4(),
          name: item.name,
          calories: Number(item.calories) || 0,
          protein: Number(item.protein) || 0,
          carbs: Number(item.carbs) || 0,
          fat: Number(item.fat) || 0,
          veggie: item.category === 'Veg' ? Number(item.serving) || 0 : 0,
          type,
          category: item.category,
          serving: Number(item.serving) || 0,
          unit: item.unit || 'g',
        });
      });
    };
    collectItems(plan?.breakfast, 'breakfast');
    collectItems(plan?.lunch, 'lunch');
    collectItems(plan?.dinner, 'dinner');
    collectItems(plan?.snack, 'snack');

    const totalCalories = planItems.reduce((acc, item) => acc + item.calories, 0);
    const totalProtein = planItems.reduce((acc, item) => acc + item.protein, 0);
    const fallbackTitle = totalProtein > 100 ? 'High Protein Plan' : 'Balanced Daily Plan';
    const fallbackDesc = `~${Math.round(totalCalories)} kcal • ${Math.round(totalProtein)}g Protein`;

    return {
      template: {
        id: lastSavedPlanId || uuidv4(),
        name: plan?.title || fallbackTitle,
        description: plan?.description || fallbackDesc,
        icon: ChefHat,
        color: getRandomPlanColor(),
        items: planItems,
        isCustom: true,
      },
      planHash: JSON.stringify(planItems),
    };
  };

  const splitCoachingLongReply = (text: string, lang: 'zh' | 'en') => {
    const normalized = normalizeMessageText(text);
    if (!normalized) return [normalized];

    // Only split when one long reply mixes "advice" and "full-day plan".
    const hasAdvice =
      /(建议|优化|调整|小贴士|advice|tips?|optimi|what to change)/i.test(normalized);
    const hasPlan =
      /(一天.*计划|一日.*计划|饮食参考计划|meal plan|daily plan|one-day plan|breakfast|lunch|dinner|snack|早餐|午餐|晚餐|加餐)/i
        .test(normalized);
    const minLen = lang === 'zh' ? 320 : 500;
    if (!hasAdvice || !hasPlan || normalized.length < minLen) return [normalized];

    const lines = normalized.split('\n').map(l => l.trimEnd());
    // Prefer splitting at explicit plan headers; fallback to first meal-time line.
    const planHeaderPattern =
      /(一天.*计划|一日.*计划|饮食参考计划|meal plan|daily plan|one-day plan|^📅|^🗓|^🍽)/i;
    const mealLinePattern =
      /^(?:⏰\s*)?(?:早餐|午餐|晚餐|加餐|breakfast|lunch|dinner|snack)\b/i;

    let splitIdx = lines.findIndex((line, idx) => idx > 0 && planHeaderPattern.test(line));
    if (splitIdx < 0) {
      splitIdx = lines.findIndex((line, idx) => idx > 0 && mealLinePattern.test(line));
    }
    if (splitIdx < 0) return [normalized];

    const first = lines.slice(0, splitIdx).join('\n').trim();
    const second = lines.slice(splitIdx).join('\n').trim();
    if (!first || !second) return [normalized];
    return [first, second];
  };

  const inferInteractionScene = (params: {
    text: string;
    image?: string | null;
    hasExplicitRecordIntent: boolean;
  }): InteractionScene => {
    const content = (params.text || '').toLowerCase();
    const planIntent =
      /(生成.*(饮食)?计划|制定.*(饮食)?计划|meal plan|generate.*plan|plan for me|生成周末计划|weekend plan)/i.test(content);
    const analysisIntent =
      /(分析|评估|优化|总结|整体|习惯|作息|长期|饮食结构|analy|review|optimi)/i.test(content);
    const mealEstimateIntent =
      /(这餐|这顿|这一餐|这份|估算|热量|卡路里|营养|识别|what did i eat|estimate|calories|nutrition)/i.test(content);
    const mealReportIntent =
      /(我刚吃了|刚吃了|我吃了|今天吃了|刚刚吃了|吃了个|ate|just ate|i had|had for)/i.test(content);
    const recordAnalysisIntent =
      /(每日|每周|本周|这周|周报|日报|记录分析|饮食记录分析|daily|weekly|record analysis|food log analysis)/i.test(content);

    if (params.hasExplicitRecordIntent) return 'meal_estimate';
    if (recordAnalysisIntent) return 'record_analysis';
    if (planIntent) return 'diet_coaching';
    if (params.image && !analysisIntent) return 'meal_estimate';
    if (mealReportIntent) return 'meal_estimate';
    if (analysisIntent) return 'diet_coaching';
    if (mealEstimateIntent) return 'meal_estimate';
    return 'diet_coaching';
  };

  const hasRecordIntent = (text: string) => {
    const normalized = (text || '').trim().toLowerCase();
    if (!normalized) return false;

    const shortCommand =
      /^(记录|记下|记一下|记这顿|记这餐|帮我记|帮我记录|加入记录|添加记录|保存记录|log|record|add)$/i.test(normalized);
    if (shortCommand) return true;

    return /(帮我记|记录一下|记一下|记这顿|记这餐|把这(一餐|顿).*(放进|加入).*(记录|日志)|记录到.*(饮食|记录|日志)|加入到.*(饮食|记录|日志)|add this meal|log this meal|record this meal|add.*to.*(record|log))/i
      .test(normalized);
  };

  const hasMealReportIntent = (text: string) => {
    const normalized = (text || '').trim().toLowerCase();
    if (!normalized) return false;
    return /(我刚吃了|刚吃了|我吃了|今天吃了|刚刚吃了|吃了个|还吃了|又吃了|另外吃了|还喝了|又喝了|另外喝了|我喝了|今天喝了|ate|just ate|i had|had for|also had|also ate|also drank|(?:^|[\s，。！？,.!?])(吃了|喝了)(?:$|[\s，。！？,.!?]))/i
      .test(normalized);
  };

  const hasConcreteMealContext = (text: string, image?: string | null) => {
    if (image) return true;
    const normalized = (text || '').trim().toLowerCase();
    if (!normalized) return false;
    if (hasMealReportIntent(normalized)) return true;
    return /(这餐|这顿|这一餐|这份|刚才那餐|刚刚那餐|this meal|this intake|that meal|我吃了|我喝了|吃了|喝了|ate|drank|had)/i
      .test(normalized);
  };

  const stripRecordConfirmationQuestion = (text: string) => {
    return normalizeMessageText(text)
      .replace(/(这个数字你认可吗[？?]\s*)?要现在帮你记入(日志|记录)(吗)?[？?]?/gi, '')
      .replace(/要不要(我)?(现在)?帮你(记一下|记录|记入(日志|记录)?)(吗)?[？?]?/gi, '')
      .replace(/是否(需要)?(现在)?(帮你)?(记录|记入)(这餐|这一餐|这顿)?(吗)?[？?]?/gi, '')
      .replace(/(do you want me to )?(log (it|this meal) now)\??/gi, '')
      .replace(/(should i )?(log (it|this meal) (for you )?now)\??/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  const buildRecordPreviewText = (
    baseText: string,
    mealLogData: MealLogPayload | undefined,
    lang: 'zh' | 'en',
    preferStructured = false
  ) => {
    const genericAck = /^(已收到[。.!]?|收到[。.!]?|ok[。.!]?|okay[。.!]?|got it[。.!]?)$/i.test(
      normalizeMessageText(baseText || '')
    );
    if (!mealLogData || !Array.isArray(mealLogData.items) || mealLogData.items.length === 0) {
      return baseText;
    }

    const validItems = mealLogData.items.filter(item => item && item.name);
    if (validItems.length === 0) return baseText;

    const itemsTextZh = validItems
      .slice(0, 6)
      .map(item => `${item.name}${Number(item.serving) > 0 ? `(${Math.round(Number(item.serving))}${item.unit || 'g'})` : ''}`)
      .join('、');
    const itemsTextEn = validItems
      .slice(0, 6)
      .map(item => `${item.name}${Number(item.serving) > 0 ? ` (${Math.round(Number(item.serving))}${item.unit || 'g'})` : ''}`)
      .join(', ');

    const totalCalories = Math.round(validItems.reduce((acc, item) => acc + (Number(item.calories) || 0), 0));
    const totalProtein = Math.round(validItems.reduce((acc, item) => acc + (Number(item.protein) || 0), 0));
    const totalCarbs = Math.round(validItems.reduce((acc, item) => acc + (Number(item.carbs) || 0), 0));
    const totalFat = Math.round(validItems.reduce((acc, item) => acc + (Number(item.fat) || 0), 0));

    const structuredZh = `识别到这餐大概有：${itemsTextZh}。\n营养估算：约${totalCalories}kcal，蛋白质${totalProtein}g，碳水${totalCarbs}g，脂肪${totalFat}g。`;
    const structuredEn = `I identified this meal as: ${itemsTextEn}.\nEstimated nutrition: about ${totalCalories} kcal, protein ${totalProtein}g, carbs ${totalCarbs}g, fat ${totalFat}g.`;

    if (preferStructured || genericAck) {
      return lang === 'zh' ? structuredZh : structuredEn;
    }

    return baseText;
  };


  const enforceMealEstimateReply = (text: string, lang: 'zh' | 'en', _shouldAutoRecord = false) => {
    const normalized = normalizeMessageText(text).replace(/\n{3,}/g, '\n\n').trim();
    if (!normalized) return normalized;

    const maxLines = 5;
    const maxChars = lang === 'zh' ? 220 : 320;
    const clampChars = (s: string) => {
      const chars = Array.from(s);
      if (chars.length <= maxChars) return s;
      return chars.slice(0, maxChars).join('').replace(/[，,。;；:\s-]*$/, '') + (lang === 'zh' ? '。' : '.');
    };

    // Keep meal-estimate reply concise but conversational.
    // Remove rigid headings/status lines if model emits them.
    const stripped = normalized
      .replace(/^吃了什么[:：]\s*/gim, '')
      .replace(/^营养估算[:：]\s*/gim, '')
      .replace(/^what you ate[:：]\s*/gim, '')
      .replace(/^nutrition estimate[:：]\s*/gim, '')
      .replace(/^是否记录[:：].*$/gim, '')
      .replace(/^log it\??[:：].*$/gim, '')
      .replace(/^记录状态[:：].*$/gim, '')
      .replace(/^recording status[:：].*$/gim, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const lines = clampChars(stripped)
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .slice(0, maxLines);
    return lines.join('\n');
  };

  const decideIntentByRules = (params: {
    text: string;
    image?: string | null;
  }): { scene: InteractionScene; recordIntent: boolean; ambiguous: boolean } => {
    const content = (params.text || '').trim().toLowerCase();
    const hasImage = Boolean(params.image);
    const recordIntent = hasRecordIntent(content);
    const mealReportIntent = hasMealReportIntent(content);
    const planIntent =
      /(生成.*(饮食)?计划|制定.*(饮食)?计划|meal plan|generate.*plan|plan for me|生成周末计划|weekend plan)/i.test(content);
    const analysisIntent =
      /(分析|评估|优化|总结|整体|习惯|作息|长期|饮食结构|analy|review|optimi)/i.test(content);
    const recordAnalysisIntent =
      /(每日|每周|本周|这周|周报|日报|记录分析|饮食记录分析|daily|weekly|record analysis|food log analysis)/i.test(content);
    const estimateIntent =
      /(这餐|这顿|这一餐|这份|估算|热量|卡路里|营养|识别|what did i eat|estimate|calories|nutrition)/i.test(content);

    // Fast path: explicit meal report should go straight to meal_estimate.
    if (mealReportIntent) {
      return {
        scene: 'meal_estimate',
        recordIntent,
        ambiguous: false,
      };
    }

    const votes = [
      recordIntent ? 'meal_estimate' : null,
      planIntent ? 'diet_coaching' : null,
      analysisIntent ? 'diet_coaching' : null,
      recordAnalysisIntent ? 'record_analysis' : null,
      estimateIntent ? 'meal_estimate' : null,
      hasImage && !analysisIntent ? 'meal_estimate' : null,
    ].filter(Boolean) as InteractionScene[];
    const uniqueVotes = Array.from(new Set(votes));
    const shortAndVague = content.length > 0 && content.length <= 2;
    const ambiguous =
      shortAndVague ||
      uniqueVotes.length === 0 ||
      (uniqueVotes.length > 1 &&
        !(uniqueVotes.length === 2 &&
          uniqueVotes.includes('meal_estimate') &&
          uniqueVotes.includes('diet_coaching') &&
          hasImage));

    return {
      scene: uniqueVotes[0] || (hasImage ? 'meal_estimate' : 'diet_coaching'),
      recordIntent,
      ambiguous,
    };
  };

  useEffect(() => {
    if (isFirstRender.current) {
      scrollToBottom(true);
      isFirstRender.current = false;
    } else {
      scrollToBottom();
    }
  }, [messages, isListening, selectedImages, interimInput]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [input, interimInput]);

  const processBatch = async () => {
    const getNowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const processStartMs = getNowMs();
    const combinedText = pendingMessagesRef.current.join(' ');
    const currentImages = pendingImagesRef.current;
    const currentImage = currentImages[0] || null;
    
    // Clear pending
    pendingMessagesRef.current = [];
    pendingImagesRef.current = [];
    
    if (!combinedText.trim() && !currentImage) return;

    setIsLoading(true);

    // Quick water logging from natural language
    const waterMatch = combinedText.match(
      /(?:喝了|刚喝了|我喝了|又喝了|还喝了|drank|just drank|had)\s*(?:(\d+)\s*(?:ml|毫升)|(\d+)\s*(?:杯|cup|glass)(?:es)?(?:\s*水|\s*water)?|(?:一[大]?杯|a\s*(?:big\s*)?(?:glass|cup)\s*(?:of\s*)?water))/i
    );
    if (waterMatch && !forcedSceneRef.current) {
      let amount = 250;
      if (waterMatch[1]) amount = parseInt(waterMatch[1]);
      else if (waterMatch[2]) amount = parseInt(waterMatch[2]) * 250;
      else if (/一大杯|big/i.test(combinedText)) amount = 500;

      addWater(amount);
      const waterTarget = user?.waterTarget || 2000;
      const newTotal = todayWaterTotal + amount;
      const remaining = Math.max(0, waterTarget - newTotal);
      const reply = language === 'zh'
        ? `已记录 ${amount}ml 水。今天累计 ${newTotal}ml${remaining > 0 ? `，还差 ${remaining}ml 达标` : '，已达标！'}`
        : `Logged ${amount}ml water. Today: ${newTotal}ml. ${remaining > 0 ? `${remaining}ml to go.` : 'Target reached!'}`;
      setMessages(prev => [
        ...prev,
        {
          role: 'model',
          text: reply,
        },
      ]);
      setShowQuickModeButtons(true);
      setIsLoading(false);
      return;
    }

    try {
      const ruleIntent = decideIntentByRules({
        text: combinedText,
        image: currentImage,
      });
      const intentStartMs = getNowMs();
      const forcedScene = forcedSceneRef.current;
      const modelIntent = !forcedScene && ruleIntent.ambiguous
        ? await detectInteractionIntent({
            language,
            userText: combinedText,
            hasImage: Boolean(currentImage),
            recentAssistantText: messages.filter(m => m.role === 'model').slice(-1)[0]?.text,
          })
        : undefined;
      const intentElapsedMs = Math.round(getNowMs() - intentStartMs);

      const hasExplicitRecordIntent = ruleIntent.recordIntent || Boolean(modelIntent?.recordIntent);
      const hasReportedMealIntake = hasMealReportIntent(combinedText);
      const combinedNormalized = (combinedText || '').trim().toLowerCase();
      const combinedCompact = combinedNormalized.replace(/[\s，,。.!！?？~～'’"“”]/g, '');
      const interactionScene: InteractionScene =
        forcedScene
          ? forcedScene
          : hasExplicitRecordIntent
            ? 'meal_estimate'
            : ((ruleIntent.scene === 'meal_estimate' || ruleIntent.scene === 'record_analysis')
                ? ruleIntent.scene
                : (modelIntent?.scene || ruleIntent.scene));
      if (interactionScene === 'diet_coaching' && !forcedSceneRef.current) {
        forcedSceneRef.current = 'diet_coaching';
      }
      const hasMealContext = hasConcreteMealContext(combinedText, currentImage);
      const imageAutoRecord = Boolean(currentImage) && interactionScene === 'meal_estimate';
      let shouldAttemptRecord = (!forcedScene || forcedScene === 'meal_estimate')
        && (imageAutoRecord || forcedScene === 'meal_estimate' || ((hasExplicitRecordIntent || hasReportedMealIntake) && hasMealContext));

      const mainReplyStartMs = getNowMs();
      const { text, mealPlan, correctedUserText, suggestions, mealLog } = await sendMessageToAI(
        messages, 
        combinedText, 
        {
          ...user,
          planCount: allPlans.length,
          language,
          interactionScene,
          shouldAutoRecord: shouldAttemptRecord,
          dailyLogs: interactionScene === 'record_analysis' ? dailyLogs : undefined,
          todayWaterTotal,
        },
        currentImages.length > 0 ? currentImages : undefined
      );
      const mainReplyElapsedMs = Math.round(getNowMs() - mainReplyStartMs);
      const toSafeCategory = (raw: any): MealItem['category'] => {
        if (raw === 'Prot' || raw === 'Veg' || raw === 'Carb' || raw === 'Fat') return raw;
        return 'Carb';
      };
      const inferMealTypeFromText = (text: string): MealItem['type'] | null => {
        if (!text) return null;
        const t = text.toLowerCase();
        if (/(早餐|早饭|早上吃|早起吃|breakfast|morning meal)/i.test(t)) return 'breakfast';
        if (/(午餐|午饭|中午吃|中饭|lunch|midday meal)/i.test(t)) return 'lunch';
        if (/(晚餐|晚饭|晚上吃|dinner|evening meal|supper)/i.test(t)) return 'dinner';
        if (/(宵夜|夜宵|下午茶|加餐|零食|snack|late.?night|afternoon tea)/i.test(t)) return 'snack';
        if (/(早上|清晨|清早)/i.test(t)) return 'breakfast';
        if (/(中午|正午|noon)/i.test(t)) return 'lunch';
        if (/(晚上|傍晚|evening)/i.test(t)) return 'dinner';
        return null;
      };

      const toMealType = (raw: any): MealItem['type'] => {
        const fromUserText = inferMealTypeFromText(combinedText);
        if (fromUserText) return fromUserText;
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 11) return 'breakfast';
        if (hour >= 11 && hour < 16) return 'lunch';
        if (hour >= 16 && hour < 22) return 'dinner';
        return 'snack';
      };

      let fallbackElapsedMs = 0;
      let hasRecordedMeal = false;
      let usedFallbackMealLog = false;

      
      // If AI corrected the user's input (e.g. added punctuation), update the last user message
      // Note: With batching, this is tricky because we might have multiple user messages.
      // We'll skip updating the user message for now to avoid complexity with multiple messages.

      // Clean up the text response to remove JSON and normalize HTML line breaks.
      const normalizedText = normalizeMessageText(
        text
        .replace(/```json[\s\S]*?```|```[\s\S]*?```/, '')
      );
      let cleanText = normalizedText;
      
      // Use suggestions from AI (:::suggestions::: or [bracket] format)
      let aiSuggestions: string[] = suggestions || [];

      let finalAiText = cleanText;
      const originalAiText = cleanText;
      if (aiSuggestions.length === 0) {
        const bracketOptions = Array.from(finalAiText.matchAll(/\[([^\[\]\n]{1,40})\]/g))
          .map(m => m[1].trim())
          .filter(Boolean);
        if (bracketOptions.length >= 2) {
          aiSuggestions = bracketOptions.slice(0, 2);
          finalAiText = finalAiText.replace(/\s*\[[^\[\]\n]{1,40}\]/g, '').trim();
        }
      }

      finalAiText = finalAiText.replace(/\n{3,}/g, '\n\n').trim();

      const aiServiceErrored = isAiServiceErrorText(finalAiText);
      if (aiServiceErrored) {
        shouldAttemptRecord = false;
        aiSuggestions = [];
      }

      if (interactionScene === 'meal_estimate' && !aiServiceErrored) {
        finalAiText = enforceMealEstimateReply(finalAiText, language, shouldAttemptRecord);
      }

      if (interactionScene === 'meal_estimate' && !shouldAttemptRecord) {
        const asksLogOption =
          /(保存到饮食日志|记入饮食日志|保存到记录|记录这餐|log this meal|save to (food )?log|add to (food )?log)/i
            .test(finalAiText);
        if (asksLogOption && aiSuggestions.length === 0) {
          aiSuggestions = language === 'zh' ? ['保存到饮食日志'] : ['Save to food log'];
        }
        finalAiText = finalAiText
          .replace(/^.*(保存到饮食日志|记入饮食日志|保存到记录|记录这餐|log this meal|save to (food )?log|add to (food )?log).*$\n?/gim, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }

      if (interactionScene === 'meal_estimate' && shouldAttemptRecord) {
        aiSuggestions = [];
      }

      if (
        interactionScene === 'diet_coaching' &&
        !aiServiceErrored &&
        /\d+[\.\)、]/.test(finalAiText)
      ) {
        const bulletLines = finalAiText
          .split('\n')
          .map(l => l.trim())
          .filter(l => /^\d+[\.\)、]\s*/.test(l))
          .map(l => l.replace(/^\d+[\.\)、]\s*/, '').replace(/\*\*/g, '').trim())
          .filter(Boolean)
          .slice(0, 5);
        if (bulletLines.length >= 2) {
          setSavedAdvice(JSON.stringify(bulletLines));
          if (aiSuggestions.length === 0 && !mealPlan) {
            aiSuggestions = language === 'zh'
              ? ['生成完整饮食计划', '先不用了']
              : ['Generate full meal plan', 'Not now'];
          }
        }
      }

      const isSaveAction = /保存计划|采纳并保存|保存当前方案|保存.*到记录|保存.*方案|采纳.*计划|save plan|adopt and save|save current plan|save.*to record/i.test(combinedText);
      if (isSaveAction && currentMealPlan) {
        const { template, planHash } = buildTemplateFromMealPlan(currentMealPlan);
        const isPlanChanged = planHash !== lastSavedPlanHashRef.current;
        if (isPlanChanged) {
          const saved = saveMealPlan(template);
          if (saved) {
            setLastSavedPlanId(template.id);
            lastSavedPlanHashRef.current = planHash;
            finalAiText = language === 'zh'
              ? '计划已保存。要不要我再为你生成一份新的方案（例如周末版）？'
              : 'Plan saved. Would you like me to generate another plan (for example, a weekend version)?';
          } else {
            setPendingPlanToSave(template);
            setIsSaveModalOpen(true);
            finalAiText = language === 'zh' ? '请在弹窗中确认保存。' : 'Please confirm save in the dialog.';
          }
        } else {
          finalAiText = language === 'zh'
            ? '这个计划已经保存过了。要不要我再生成一个新方案？'
            : 'This plan is already saved. Would you like me to generate another one?';
        }
        aiSuggestions = language === 'zh' ? ['生成新计划', '先不生成'] : ['Generate another plan', 'Not now'];
      }

      if (mealPlan) {
        setMealPlan(mealPlan);
        if (aiSuggestions.length === 0) {
          aiSuggestions = language === 'zh' ? ['保存计划', '我想调整'] : ['Save plan', 'I want changes'];
        }
      }

      if (shouldAttemptRecord) {
        const claimsRecorded =
          /(已帮你记|已记录|加入今日饮食记录|added to today'?s food log|has been added to.*log)/i.test(finalAiText);
        if (claimsRecorded) {
          finalAiText =
            language === 'zh'
              ? '我先帮你做了营养估算。接下来将为你执行记录。'
              : 'I provided a nutrition estimate first. Next, I will log this meal for you.';
        }
        finalAiText = stripRecordConfirmationQuestion(finalAiText);
      }

      if (!finalAiText.trim()) {
        finalAiText = mealPlan
          ? (language === 'zh'
              ? '计划已生成。你要保存当前计划，还是继续调整后再保存？'
              : 'Plan generated. Do you want to save this plan now, or adjust it first?')
          : (language === 'zh'
              ? '已收到。'
              : 'Got it.');
      }

      // If meal plan is parsed but display text does not contain concrete meals,
      // render a concise readable plan so user can see what will be saved.
      if (
        interactionScene === 'diet_coaching' &&
        mealPlan &&
        !hasPlanDraftInText(finalAiText)
      ) {
        const renderedPlan = renderMealPlanText(mealPlan, language);
        if (renderedPlan) {
          finalAiText = `${finalAiText}\n\n${renderedPlan}`.trim();
        }
      }

      if (shouldAttemptRecord) {
        const fallbackStartMs = getNowMs();
        let resolvedMealLog =
          mealLog && Array.isArray(mealLog.items) && mealLog.items.length > 0
            ? mealLog
            : await extractMealLogForRecord({
                language,
                userText:
                  combinedText ||
                  (language === 'zh'
                    ? '请根据这张图片将本餐记录到饮食日志。'
                    : 'Please log this meal based on the image.'),
                recentAssistantText: originalAiText,
              });
        fallbackElapsedMs = Math.round(getNowMs() - fallbackStartMs);
        usedFallbackMealLog = !(
          mealLog &&
          Array.isArray(mealLog.items) &&
          mealLog.items.length > 0
        );

        // Image-first meal_estimate should still produce a saved log even if parser misses once.
        if ((!resolvedMealLog || !Array.isArray(resolvedMealLog.items) || resolvedMealLog.items.length === 0) && currentImage) {
          const parseMetric = (pattern: RegExp) => {
            const m = originalAiText.match(pattern);
            if (!m) return 0;
            const a = Number(m[1] || 0);
            const b = Number(m[2] || 0);
            if (a > 0 && b > 0) return Math.round((a + b) / 2);
            return a > 0 ? a : b > 0 ? b : 0;
          };
          const calories = parseMetric(/(?:热量|calories?)\s*(?:约|around)?\s*(\d+)\s*[-~至到]?\s*(\d+)?\s*k?cal/i) || parseMetric(/(\d+)\s*[-~至到]\s*(\d+)\s*k?cal/i);
          const protein = parseMetric(/(?:蛋白质|protein)\s*(\d+)\s*[-~至到]?\s*(\d+)?\s*g/i);
          const carbs = parseMetric(/(?:碳水|carbs?)\s*(\d+)\s*[-~至到]?\s*(\d+)?\s*g/i);
          const fat = parseMetric(/(?:脂肪|fat)\s*(\d+)\s*[-~至到]?\s*(\d+)?\s*g/i);

          resolvedMealLog = {
            mealType: toMealType(undefined),
            items: [
              {
                category: 'Carb',
                name: language === 'zh' ? '拍照识别餐食' : 'Photo-recognized meal',
                serving: 1,
                unit: language === 'zh' ? '份' : 'serving',
                protein,
                carbs,
                fat,
                calories,
              },
            ],
          };
        }

        finalAiText = buildRecordPreviewText(
          finalAiText,
          resolvedMealLog,
          language,
          Boolean(currentImage)
        );

        if (resolvedMealLog && Array.isArray(resolvedMealLog.items) && resolvedMealLog.items.length > 0) {
          const mealType = toMealType(resolvedMealLog.mealType);
          const now = Date.now();
          const logsToAdd: MealItem[] = resolvedMealLog.items
            .filter(item => item && item.name)
            .map(item => {
              const category = toSafeCategory((item as MealLogPayload['items'][number]).category);
              const serving = Number(item.serving) || 0;
              return {
                id: uuidv4(),
                name: String(item.name),
                calories: Number(item.calories) || 0,
                protein: Number(item.protein) || 0,
                carbs: Number(item.carbs) || 0,
                fat: Number(item.fat) || 0,
                veggie: category === 'Veg' ? serving : 0,
                type: mealType,
                timestamp: now,
                category,
                serving,
                unit: String(item.unit || 'g'),
              };
            });
          if (logsToAdd.length > 0) {
            addLogs(logsToAdd);
            hasRecordedMeal = true;
          }
        }

        const successPhrasesZh = [
          '这餐已经记好了，已同步到今天的饮食记录。',
          '已为你记入今日饮食记录。',
          '记录完成，今天这餐已经存档。',
        ];
        const successPhrasesEn = [
          'Logged. This meal is now in today\'s food record.',
          'Done, I saved this meal to today\'s food log.',
          'Saved successfully. This meal has been added to today\'s record.',
        ];
        const failPhrasesZh = [
          '这次没能成功记录，你可以再说一次“帮我记录这餐”。',
          '还没记录成功，再说一次“记录这餐”我马上补上。',
        ];
        const failPhrasesEn = [
          'I could not log it this time. Please say "log this meal" again.',
          'Not saved yet. Say "log this meal" once more and I will do it right away.',
        ];
        const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)] || arr[0];
        const completionText = hasRecordedMeal
          ? (language === 'zh' ? pick(successPhrasesZh) : pick(successPhrasesEn))
          : (language === 'zh' ? pick(failPhrasesZh) : pick(failPhrasesEn));
        const mergedText = finalAiText.trim()
          ? `${finalAiText}\n\n${completionText}`
          : completionText;

        setMessages(prev => [
          ...prev,
          {
            role: 'model',
            text: mergedText,
          },
        ]);
        if (interactionScene === 'meal_estimate') {
          setShowQuickModeButtons(true);
        }
      } else {
        const splitParts =
          interactionScene === 'diet_coaching'
            ? splitCoachingLongReply(finalAiText, language)
            : [finalAiText];
        if (splitParts.length > 1) {
          setMessages(prev => {
            const chunks: ChatMessage[] = splitParts.map((part, idx) => ({
              role: 'model',
              text: part,
              suggestions: idx === splitParts.length - 1 ? aiSuggestions : undefined,
            }));
            return [...prev, ...chunks];
          });
        } else {
          const aiMsg: ChatMessage = { role: 'model', text: finalAiText, suggestions: aiSuggestions };
          setMessages(prev => [...prev, aiMsg]);
        }
        const isDecliningMorePlans =
          /(先不生成|暂不生成|不用了|不需要|no|not now|i'm good|no thanks)/i.test(combinedText);
        if (interactionScene === 'diet_coaching' && isDecliningMorePlans) {
          setShowQuickModeButtons(true);
        }
        if (interactionScene === 'record_analysis') {
          setShowQuickModeButtons(true);
        }
        if (interactionScene === 'meal_estimate') {
          setShowQuickModeButtons(true);
        }
      }

      const totalElapsedMs = Math.round(getNowMs() - processStartMs);
      console.info('[chat-latency]', {
        totalElapsedMs,
        intentElapsedMs,
        mainReplyElapsedMs,
        fallbackElapsedMs,
        interactionScene,
        usedModelIntent: Boolean(modelIntent),
        usedFallbackMealLog,
        shouldAttemptRecord,
        hasRecordedMeal,
      });

    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
      if (showQuickModeAfterReplyRef.current) {
        showQuickModeAfterReplyRef.current = false;
        setShowQuickModeButtons(true);
      }
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    const normalized = suggestion.trim().toLowerCase();
    const isMealLoggingEntry =
      /(饮食记录|记录这餐|拍照\/文字记录饮食|拍照记录饮食|文字记录饮食|log meals by photo\/text|log meals|meal log)/i
        .test(normalized);
    const isPlanGenerationEntry =
      /(生成计划|生成饮食计划|做饮食计划|优化计划生成|饮食计划生成|generate optimized plan|generate meal plan|optimi[sz]ed plan)/i
        .test(normalized);
    const isRecordAnalysisEntry =
      /(饮食分析|看记录分析|每日\/每周饮食记录分析|饮食记录分析|记录分析|daily\/weekly record analysis|record analysis|food log analysis)/i
        .test(normalized);
    const isSaveMealLogAction =
      /(保存到饮食日志|记入饮食日志|保存到记录|记录这餐|save to (food )?log|add to (food )?log|log this meal)/i
        .test(normalized);
    const isSavePlanAction =
      /(保存计划|采纳并保存|保存当前方案|采纳此方案|保存.*到记录|保存.*方案|采纳.*计划|save plan|adopt and save|save current plan|save.*to record)/i
        .test(normalized);

    if (isMealLoggingEntry) {
      forcedSceneRef.current = 'meal_estimate';
      startedModeRef.current = 'meal_estimate';
      setShowQuickModeButtons(false);
      const quickReply =
        language === 'zh'
          ? '好，你可以直接说这餐吃了什么，或上传图片。'
          : 'Sure. Tell me what you ate, or upload a meal photo. I will estimate nutrition first, then log it for you.';
      setMessages(prev => [
        ...prev,
        { role: 'user', text: suggestion },
        { role: 'model', text: quickReply },
      ]);
      return;
    }

    if (isPlanGenerationEntry) {
      forcedSceneRef.current = 'diet_coaching';
      startedModeRef.current = 'diet_coaching';
      setShowQuickModeButtons(false);
      const quickReply =
        language === 'zh'
          ? '好，我们先从作息开始：你通常几点起床，早餐大概几点吃？'
          : 'Great, let us start with your routine. To build a practical plan, what time do you usually wake up, and when do you usually have breakfast?';
      setMessages(prev => [
        ...prev,
        { role: 'user', text: suggestion },
        { role: 'model', text: quickReply },
      ]);
      return;
    }

    if (isRecordAnalysisEntry) {
      forcedSceneRef.current = 'record_analysis';
      startedModeRef.current = 'record_analysis';
      setShowQuickModeButtons(false);
      const quickReply =
        language === 'zh'
          ? '好，我们来做记录分析。你想先看今天，还是本周？'
          : 'Great, we are now in periodic food-record analysis mode. Do you want to review today first, or the weekly trend?';
      setMessages(prev => [
        ...prev,
        { role: 'user', text: suggestion },
        {
          role: 'model',
          text: quickReply,
          suggestions: language === 'zh' ? ['今天', '本周'] : ['Today', 'This week'],
        },
      ]);
      return;
    }

    const isWaterLoggingEntry =
      /(喝水打卡|喝水记录|记录喝水|log water|water intake|drink water)/i.test(normalized);
    if (isWaterLoggingEntry) {
      const waterTarget = user?.waterTarget || 2000;
      addWater(250);
      const newTotal = todayWaterTotal + 250;
      const remaining = Math.max(0, waterTarget - newTotal);
      const quickReply = language === 'zh'
        ? `已帮你记录 250ml 水。今天累计喝了 ${newTotal}ml，${remaining > 0 ? `还差 ${remaining}ml 达标，继续加油！` : '已达标，做得很棒！'}`
        : `Logged 250ml of water. Today's total: ${newTotal}ml. ${remaining > 0 ? `${remaining}ml more to reach your goal. Keep it up!` : 'You\'ve hit your target — great job!'}`;
      setMessages(prev => [
        ...prev,
        { role: 'user', text: suggestion },
        {
          role: 'model',
          text: quickReply,
        },
      ]);
      setShowQuickModeButtons(true);
      return;
    }

    const isWaterFollowUp =
      /(再喝一杯|再来一杯|\+250|one more glass)/i.test(normalized);
    const isBigWaterFollowUp =
      /(一大杯|\+500|big glass)/i.test(normalized);
    if (isWaterFollowUp || isBigWaterFollowUp) {
      const amount = isBigWaterFollowUp ? 500 : 250;
      addWater(amount);
      const waterTarget = user?.waterTarget || 2000;
      const newTotal = todayWaterTotal + amount;
      const remaining = Math.max(0, waterTarget - newTotal);
      const quickReply = language === 'zh'
        ? `又记录了 ${amount}ml，今天累计 ${newTotal}ml。${remaining > 0 ? `还差 ${remaining}ml。` : '已达标！'}`
        : `Added ${amount}ml. Today's total: ${newTotal}ml. ${remaining > 0 ? `${remaining}ml to go.` : 'Target reached!'}`;
      setMessages(prev => [
        ...prev,
        { role: 'user', text: suggestion },
        {
          role: 'model',
          text: quickReply,
        },
      ]);
      setShowQuickModeButtons(true);
      return;
    }

    if (isSaveMealLogAction) {
      forcedSceneRef.current = 'meal_estimate';
      startedModeRef.current = 'meal_estimate';
      setShowQuickModeButtons(false);
      handleSend(
        language === 'zh' ? '把这餐保存到饮食日志' : 'Save this meal to my food log',
        true
      );
      return;
    }

    if (isSavePlanAction && currentMealPlan) {
      setMessages(prev => [...prev, { role: 'user', text: suggestion }]);
      const { template, planHash } = buildTemplateFromMealPlan(currentMealPlan);
      const isPlanChanged = planHash !== lastSavedPlanHashRef.current;

      if (!isPlanChanged) {
        setMessages(prev => [
          ...prev,
          {
            role: 'model',
            text: language === 'zh' ? '这个计划已经保存过了。要不要我再生成一个新方案？' : 'This plan is already saved. Do you want me to generate another one?',
            suggestions: language === 'zh' ? ['生成新计划', '先不生成'] : ['Generate another plan', 'Not now'],
          },
        ]);
        return;
      }

      const saved = saveMealPlan(template);
      if (saved) {
        setLastSavedPlanId(template.id);
        lastSavedPlanHashRef.current = planHash;
        setMessages(prev => [
          ...prev,
          {
            role: 'model',
            text: language === 'zh' ? '计划已保存。要不要我再为你生成一份新的方案（例如周末版）？' : 'Plan saved. Would you like me to generate another plan (for example, a weekend version)?',
            suggestions: language === 'zh' ? ['生成新计划', '先不生成'] : ['Generate another plan', 'Not now'],
          },
        ]);
      } else {
        setPendingPlanToSave(template);
        setIsSaveModalOpen(true);
      }
      return;
    }

    const isDecliningAction =
      /(先不生成|暂不生成|不用了|不需要|not now|no thanks|i'm good)/i.test(normalized);
    if (isDecliningAction) {
      showQuickModeAfterReplyRef.current = true;
    }

    handleSend(suggestion, true);
  };

  const handleSend = async (overrideInput?: string, isImmediate?: boolean) => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    let fullInput = overrideInput || (input + interimInput);

    if (isListening && asrSessionRef.current) {
      const finalText = await asrSessionRef.current.stop();
      asrSessionRef.current = null;
      setIsListening(false);
      setInterimInput('');
      if (finalText && finalText.length >= fullInput.length) fullInput = finalText;
    }

    if (!fullInput.trim() && selectedImages.length === 0) return;

    const userMsg: ChatMessage & { image?: string; images?: string[] } = { 
      role: 'user', 
      text: fullInput,
      image: selectedImages[0] || undefined,
      images: selectedImages.length > 0 ? selectedImages : undefined,
    };
    
    // Add to UI immediately
    setMessages(prev => [...prev, userMsg]);
    
    // Add to pending batch
    if (fullInput.trim()) {
      pendingMessagesRef.current.push(fullInput);
    }
    if (selectedImages.length > 0) {
      pendingImagesRef.current = selectedImages;
    }
    
    setInput('');
    setInterimInput('');
    setSelectedImages([]);

    // Debounce sending to AI
    if (batchTimeoutRef.current) {
      clearTimeout(batchTimeoutRef.current);
    }
    
    if (isImmediate) {
      processBatch();
    } else {
      batchTimeoutRef.current = setTimeout(() => {
        processBatch();
      }, 2000); // Wait 2 seconds for more input
    }
  };

  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

  const toggleListening = async () => {
    if (isStartingListening) {
      return;
    }

    if (isListening) {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      const finalText = await asrSessionRef.current?.stop();
      asrSessionRef.current = null;
      setIsListening(false);
      setIsStartingListening(false);
      setInterimInput('');
      if (finalText?.trim()) {
        handleSend(finalText);
      }
      return;
    }

    try {
      setIsStartingListening(true);
      const session = await startRealtimeASR(
        (text, isFinal) => {
          if (isFinal) {
            setInput(text);
            setInterimInput('');
          } else {
            setInterimInput(text);
          }
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            handleSendRef.current();
          }, 1500);
        },
        (status) => {
          if (status === 'connected') {
            setIsStartingListening(false);
            setIsListening(true);
          } else if (status === 'error' || status === 'closed') {
            setIsStartingListening(false);
            setIsListening(prev => {
              if (prev) {
                console.warn('[ASR] connection lost while listening');
              }
              return false;
            });
            asrSessionRef.current = null;
          }
        },
        language,
      );
      asrSessionRef.current = session;
    } catch (e: any) {
      console.error('Failed to start ASR', e);
      setIsStartingListening(false);
      setIsListening(false);
      if (e?.name === 'NotAllowedError') {
        alert(language === 'zh' ? '麦克风权限被拒绝，请检查浏览器设置。' : 'Microphone access denied. Please check your browser permissions.');
      } else {
        alert(language === 'zh' ? `语音识别启动失败: ${e?.message || '未知错误'}` : `Speech recognition failed: ${e?.message || 'Unknown error'}`);
      }
    }
  };

  const handlePttStart = async () => {
    if (recordingRef.current || isTranscribing || isLoading) return;
    recordingRef.current = true;
    setIsRecording(true);
    setAudioLevel(0);
    try {
      const promise = startRecording(language, (level) => {
        setAudioLevel(level);
      });
      pttPromiseRef.current = promise;
      const controller = await promise;
      pttRef.current = controller;
    } catch (e: any) {
      recordingRef.current = false;
      setIsRecording(false);
      setAudioLevel(0);
      pttPromiseRef.current = null;
      if (e?.name === 'NotAllowedError') {
        alert(language === 'zh' ? '麦克风权限被拒绝，请检查浏览器设置。' : 'Microphone access denied.');
      }
    }
  };

  const handlePttEnd = async () => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setIsRecording(false);
    setAudioLevel(0);
    setIsTranscribing(true);

    // Immediately show a placeholder bubble in the chat area
    const placeholderMsg: ChatMessage & { image?: string } = {
      role: 'user',
      text: '',
      isTranscribing: true,
    };
    setMessages(prev => [...prev, placeholderMsg]);

    try {
      if (!pttRef.current && pttPromiseRef.current) {
        pttRef.current = await pttPromiseRef.current;
      }
      if (!pttRef.current) {
        // Remove placeholder
        setMessages(prev => prev.filter(m => m !== placeholderMsg));
        setIsTranscribing(false);
        return;
      }
      const text = await pttRef.current.stop();
      pttRef.current = null;
      pttPromiseRef.current = null;
      if (text.trim()) {
        // Replace placeholder with real text, then trigger AI
        setMessages(prev =>
          prev.map(m => m === placeholderMsg ? { ...m, text, isTranscribing: false } : m)
        );
        setIsTranscribing(false);

        // Add to pending batch and trigger processBatch (same as handleSend's immediate path)
        pendingMessagesRef.current.push(text);
        if (batchTimeoutRef.current) {
          clearTimeout(batchTimeoutRef.current);
        }
        processBatch();
      } else {
        // Empty result — remove placeholder
        setMessages(prev => prev.filter(m => m !== placeholderMsg));
        setIsTranscribing(false);
      }
    } catch (e: any) {
      console.error('[PTT] transcription error:', e);
      setMessages(prev => prev.filter(m => m !== placeholderMsg));
      setIsTranscribing(false);
    }
  };

  const compressImage = (dataUrl: string, maxDim = 1024, quality = 0.7): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = dataUrl;
    });
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const compressed = await compressImage(reader.result as string);
        setSelectedImages(prev => [...prev, compressed]);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Auto-refresh chat daily
  useEffect(() => {
    const today = new Date().toDateString();
    const lastChatDate = localStorage.getItem('diet_last_chat_date');
    if (lastChatDate && lastChatDate !== today && messages.length > 1) {
      clearChat();
    }
    localStorage.setItem('diet_last_chat_date', today);
  }, []);

  const getInitialGreeting = () => {
    if (language === 'zh') {
      return '你好呀，我是麦粒！我可以帮你合理搭配每一餐，让营养摄入更均衡。要来定制饮食计划，还是先记一餐试试？';
    }
    return "Hey, I'm Milo! I can help you balance every meal for better nutrition. Want to create a diet plan, or log a meal first?";
  };

  const clearChat = () => {
    const suggestions = language === 'zh'
      ? ['生成计划', '饮食记录', '喝水打卡']
      : ['Generate optimized plan', 'Log meals by photo/text', 'Daily/weekly record analysis'];
    const initialMessage: ChatMessage = { 
      role: 'model', 
      text: getInitialGreeting(),
      suggestions,
    };
    setMessages([initialMessage]);
    forcedSceneRef.current = null;
    startedModeRef.current = null;
    setShowQuickModeButtons(false);
    setLastSavedPlanId(null);
    lastSavedPlanHashRef.current = null;
  };

  const modeEntryButtons =
    language === 'zh'
      ? ['生成计划', '饮食记录', '喝水打卡', '饮食分析']
      : ['Generate optimized plan', 'Log meals by photo/text', 'Daily/weekly record analysis', 'Log water'];

  return (
    <div className="flex flex-col h-full bg-stone-50 relative">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 bg-white/95 backdrop-blur-sm border-b border-stone-100" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex items-center justify-between px-4 h-12">
          <div className="relative">
            <button
              onClick={() => setShowHeaderMenu(!showHeaderMenu)}
              className="p-1.5 text-stone-600 hover:text-stone-900 transition-colors rounded-lg hover:bg-stone-100"
            >
              <Menu size={20} />
            </button>
            <AnimatePresence>
              {showHeaderMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-stone-200 py-1 min-w-[160px]"
                >
                  <button
                    onClick={() => { clearChat(); setShowHeaderMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-stone-600 hover:bg-stone-50 transition-colors"
                  >
                    <Trash2 size={16} className="text-stone-400" />
                    {language === 'zh' ? '清除对话' : 'Clear Chat'}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="w-8" />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 pt-14 space-y-4" onClick={() => { setShowHeaderMenu(false); }}>
        {messages.map((msg, idx) => (
          <div key={idx} className="flex flex-col">
            <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed space-y-2 ${
                  msg.role === 'user' 
                    ? 'bg-stone-900 text-white rounded-tr-none' 
                    : 'bg-white border border-stone-200 text-stone-800 rounded-tl-none shadow-sm'
                }`}
              >
                {(msg as any).images && (msg as any).images.length > 1 ? (
                  <div className="grid grid-cols-2 gap-1.5 mb-2">
                    {(msg as any).images.map((img: string, i: number) => (
                      <img key={i} src={img} alt={`Upload ${i + 1}`} className="w-full rounded-lg max-h-36 object-cover" />
                    ))}
                  </div>
                ) : msg.image ? (
                  <img 
                    src={msg.image} 
                    alt="User upload" 
                    className="w-full rounded-lg max-h-48 object-cover mb-2"
                  />
                ) : null}
                {msg.isTranscribing ? (
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                ) : (
                <div className="text-sm leading-relaxed space-y-2">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm, remarkBreaks]}
                    components={{
                      p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                      ul: ({node, ...props}) => <ul className="list-disc pl-4 mb-2 last:mb-0" {...props} />,
                      ol: ({node, ...props}) => <ol className="list-decimal pl-4 mb-2 last:mb-0" {...props} />,
                      li: ({node, ...props}) => <li className="mb-1" {...props} />,
                      strong: ({node, ...props}) => <strong className="font-bold" {...props} />,
                      table: ({node, ...props}) => <div className="my-2 space-y-1" {...props} />,
                      thead: () => null,
                      tbody: ({node, ...props}) => <div className="space-y-1" {...props} />,
                      tr: ({node, ...props}) => <div className="leading-relaxed" {...props} />,
                      th: () => null,
                      td: ({node, ...props}) => <span className="mr-2" {...props} />,
                    }}
                  >
                    {normalizeMessageText(msg.text)}
                  </ReactMarkdown>
                </div>
                )}
              </div>
            </div>
            
            {/* Suggestions */}
            {msg.role === 'model' && idx === messages.length - 1 && shouldShowSuggestions(msg) && (
              <div className="flex flex-wrap gap-2 mt-2">
                {(msg.suggestions || []).map((suggestion, sIdx) => (
                  <button
                    key={sIdx}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="px-4 py-2 bg-white border border-stone-200 rounded-full text-sm text-stone-700 hover:bg-stone-50 hover:border-stone-300 transition-all shadow-sm active:scale-95"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-stone-200 p-4 rounded-2xl rounded-tl-none shadow-sm">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Mode Buttons (above input top border) */}
      {showQuickModeButtons && (
        <div className="px-4 py-2 bg-stone-50">
          <div className="flex items-center gap-2 overflow-x-auto overflow-y-visible whitespace-nowrap py-1 no-scrollbar">
            {modeEntryButtons.map((item) => (
              <button
                key={item}
                onClick={() => handleSuggestionClick(item)}
                className="shrink-0 px-4 py-2 bg-white border border-stone-200 rounded-full text-sm text-stone-700 hover:bg-stone-50 hover:border-stone-300 transition-all shadow-sm active:scale-95"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-stone-200 bg-white relative z-20">
        {/* Input Area */}
        <div className="px-4 py-3">

        {selectedImages.length > 0 && (
          <div className="flex gap-2 mb-3 overflow-x-auto no-scrollbar">
            <AnimatePresence>
              {selectedImages.map((img, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="relative flex-shrink-0"
                >
                  <img 
                    src={img} 
                    alt={`Preview ${idx + 1}`} 
                    className="h-20 w-20 object-cover rounded-xl border border-stone-200"
                  />
                  <button 
                    onClick={() => setSelectedImages(prev => prev.filter((_, i) => i !== idx))}
                    className="absolute -top-2 -right-2 bg-stone-900 text-white rounded-full p-1 shadow-md hover:bg-stone-700"
                  >
                    <X size={12} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

          <input 
            type="file" 
            ref={fileInputRef}
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleImageSelect}
          />

          <div className="flex items-center gap-3 w-full">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 rounded-full transition-colors text-stone-400 hover:text-stone-700 hover:bg-stone-100"
            >
              <Camera size={20} />
            </button>

            {inputMode === 'voice' ? (
              selectedImages.length > 0 ? (
                <button
                  onClick={() => handleSend(undefined, true)}
                  disabled={isLoading}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-full bg-stone-900 text-white active:bg-stone-700 transition-all disabled:opacity-50"
                >
                  <Send size={20} />
                  <span className="text-sm font-medium">{language === 'zh' ? `发送${selectedImages.length > 1 ? ` ${selectedImages.length} 张图片` : '图片'}` : `Send ${selectedImages.length > 1 ? `${selectedImages.length} images` : 'image'}`}</span>
                </button>
              ) : (
                <button
                  onMouseDown={handlePttStart}
                  onMouseUp={handlePttEnd}
                  onMouseLeave={() => { if (isRecording) handlePttEnd(); }}
                  onTouchStart={(e) => { e.preventDefault(); handlePttStart(); }}
                  onTouchEnd={(e) => { e.preventDefault(); handlePttEnd(); }}
                  disabled={isLoading || isTranscribing}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-2xl transition-all select-none ${
                    'bg-stone-100 text-stone-600 hover:bg-stone-200 active:bg-stone-200'
                  } ${isTranscribing ? 'opacity-50' : ''}`}
                >
                  {isRecording ? (
                    <div className="h-5 w-full">
                      <VoiceWaveform
                        isActive={isRecording}
                        audioLevel={audioLevel}
                        barCount={40}
                        color="#78716c"
                      />
                    </div>
                  ) : (
                    <>
                      <Mic size={20} />
                      <span className="text-sm font-medium">
                        {language === 'zh' ? '按住说话' : 'Hold to talk'}
                      </span>
                    </>
                  )}
                </button>
              )
            ) : (
              <div
                className="flex-1 flex items-center gap-1.5 bg-stone-100 rounded-full px-3"
                onTouchEnd={() => textareaRef.current?.focus()}
              >
                <textarea
                  ref={textareaRef}
                  value={input + interimInput}
                  onChange={(e) => {
                    setInput(e.target.value);
                    setInterimInput('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend(undefined, true);
                    }
                  }}
                  placeholder={t.chat.placeholder}
                  rows={1}
                  className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-stone-900 placeholder:text-stone-400 resize-none max-h-32 py-3"
                />
                <button 
                  onClick={() => handleSend(undefined, true)}
                  disabled={(!input.trim() && selectedImages.length === 0) || isLoading}
                  className="p-1.5 bg-stone-900 text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                >
                  <Send size={16} />
                </button>
              </div>
            )}

            <button
              onClick={() => switchInputMode(inputMode === 'voice' ? 'text' : 'voice')}
              className="p-2.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
            >
              {inputMode === 'voice' ? <Keyboard size={20} /> : <Mic size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Save Meal Plan Modal (for limit handling) */}
      {isSaveModalOpen && (
        <SaveMealPlanModal 
          isOpen={isSaveModalOpen}
          onClose={() => {
            setIsSaveModalOpen(false);
            setPendingPlanToSave(null);
          }}
          templateToSave={pendingPlanToSave}
          onSave={(id) => {
            setLastSavedPlanId(id);
            if (pendingPlanToSave) {
              lastSavedPlanHashRef.current = JSON.stringify(pendingPlanToSave.items);
            }
            setMessages(prev => [
              ...prev,
              {
                role: 'model',
                text: language === 'zh' ? '计划已保存。要不要我再为你生成一份新的方案（例如周末版）？' : 'Plan saved. Would you like me to generate another plan (for example, a weekend version)?',
                suggestions: language === 'zh' ? ['生成新计划', '先不生成'] : ['Generate another plan', 'Not now'],
              },
            ]);
            setPendingPlanToSave(null);
          }}
        />
      )}
    </div>
  );
}
