import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { PRESET_PLANS } from '../data/mealPlans';
import { ChatMessage } from '../services/ai';

// Types
export type Gender = 'male' | 'female' | 'other';
export type Goal = 'fat_loss' | 'muscle_gain' | 'gut_health';
export type GutSymptom = 'bloating' | 'constipation' | 'loose_stools' | 'acid_reflux' | 'cramps' | 'food_intolerance';
export type ActivityType = 'cardio' | 'strength' | 'mixed' | 'sedentary';
export type ActivityIntensity = 'low' | 'moderate' | 'high';
export type ActivityFrequency = '1-2' | '3-4' | '5+';

export interface UserProfile {
  height: number; // cm
  weight: number; // kg
  gender: Gender;
  age: number;
  dietPreference: string;
  goals: Goal[];
  activity: {
    type: ActivityType;
    intensity: ActivityIntensity;
    frequency: ActivityFrequency;
  };
  cravings: string[];
  gutSymptoms: string[];
  customCalorieTarget?: number;
  waterTarget?: number; // ml, default 2000
  onboardingComplete: boolean;
  language: 'en' | 'zh';
}

export interface WaterLog {
  id: string;
  amount: number; // ml
  timestamp: number;
}

export interface WeightLog {
  id: string;
  weight: number; // kg
  timestamp: number;
  note?: string;
}

export interface MealItem {
  id: string;
  planId?: string; // Link to a plan item if applicable
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  veggie: number; // estimated grams or portion
  type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  timestamp: number;
  // Added fields for display
  category: FoodCategory;
  serving: number;
  unit: string;
}

export type FoodCategory = 'Prot' | 'Veg' | 'Carb' | 'Fat';

export interface PlanFoodItem {
  id: string;
  category: FoodCategory;
  name: string;
  serving: number;
  unit: string;
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
}

export interface MealPlan {
  title?: string;
  description?: string;
  breakfast: PlanFoodItem[];
  lunch: PlanFoodItem[];
  dinner: PlanFoodItem[];
  snack: PlanFoodItem[];
  isOptimized: boolean;
}

// Define the structure of a preset plan template
export interface PlanTemplate {
  id: string;
  name: string;
  description: string;
  icon: any;
  color: string;
  items: Omit<MealItem, 'id' | 'timestamp'>[];
  isCustom?: boolean;
}

interface AppContextType {
  user: UserProfile | null;
  updateUser: (data: Partial<UserProfile>) => void;
  completeOnboarding: () => void;
  
  dailyLogs: MealItem[];
  addLog: (item: MealItem) => void;
  addLogs: (items: MealItem[]) => void;
  updateLog: (item: MealItem) => void;
  removeLog: (id: string) => void;
  clearLogs: () => void;
  
  mealPlan: MealPlan | null;
  setMealPlan: (plan: MealPlan) => void;

  customMealPlans: PlanTemplate[];
  deletedPlanIds: string[];
  allPlans: PlanTemplate[];
  saveMealPlan: (plan: PlanTemplate) => boolean;
  deleteMealPlan: (id: string) => void;

  chatMessages: (ChatMessage & { image?: string })[];
  setChatMessages: React.Dispatch<React.SetStateAction<(ChatMessage & { image?: string })[]>>;
  
  exerciseCalories: number;
  syncExerciseData: () => Promise<void>;
  
  savedAdvice: string | null;
  setSavedAdvice: (advice: string | null) => void;

  waterLogs: WaterLog[];
  addWater: (amount: number) => void;
  removeWater: (id: string) => void;
  todayWaterTotal: number;

  weightLogs: WeightLog[];
  addWeightLog: (weight: number, note?: string) => void;
  removeWeightLog: (id: string) => void;

  language: 'en' | 'zh';
  setLanguage: (lang: 'en' | 'zh') => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const HAS_CHATTED_ONCE_KEY = 'chat_has_user_message_once';

const DEFAULT_GREETING_TEXTS = {
  en: {
    firstTime:
      "Hey, I'm Milo! I'm here to help you eat smarter. Want to build a meal plan, or log a meal first?",
    returning:
      "Hey, I'm Milo! I'm here to help you eat smarter. Want to build a meal plan, log a meal, or check your diet analysis?",
  },
  zh: {
    firstTime:
      '你好呀，我是麦粒！我可以帮你合理搭配每一餐，让营养摄入更均衡。要来定制饮食计划，还是先记一餐试试？',
    returning:
      '你好呀，我是麦粒！我可以帮你合理搭配每一餐，让营养摄入更均衡。要来定制饮食计划，还是先记一餐试试？',
  },
} as const;

function hasChattedOnce(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(HAS_CHATTED_ONCE_KEY) === 'true';
}

function getDefaultGreeting(language: 'en' | 'zh', firstTime: boolean): string {
  return firstTime
    ? DEFAULT_GREETING_TEXTS[language].firstTime
    : DEFAULT_GREETING_TEXTS[language].returning;
}

function getDefaultGreetingSuggestions(language: 'en' | 'zh', firstTime: boolean): string[] {
  if (language === 'zh') {
    return firstTime
      ? ['生成计划', '饮食记录']
      : ['生成计划', '饮食记录', '喝水打卡'];
  }
  return firstTime
    ? ['Generate optimized plan', 'Log meals by photo/text']
    : ['Generate optimized plan', 'Log meals by photo/text', 'Daily/weekly record analysis'];
}

function readJsonFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`Failed to parse localStorage key: ${key}`, error);
    return fallback;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  // Persist user in localStorage for demo purposes
  const [user, setUser] = useState<UserProfile | null>(() => {
    const stored = readJsonFromStorage<any>('app_user', null);
    if (stored) {
      if (!Array.isArray(stored.gutSymptoms)) stored.gutSymptoms = [];
      // Migrate legacy single goal → goals array
      if (!Array.isArray(stored.goals)) {
        const legacy = stored.goal;
        const mapped = legacy === 'maintain' ? 'gut_health' : legacy;
        stored.goals = mapped ? [mapped] : ['gut_health'];
        delete stored.goal;
      }
      stored.goals = stored.goals.map((g: string) => g === 'maintain' ? 'gut_health' : g);
    }
    return stored as UserProfile | null;
  });

  // MOCK DATA FOR VISUALIZATION
  const MOCK_MEAL_PLAN: MealPlan = {
    breakfast: [
      { id: 'b1', category: 'Prot', name: 'Milk, regular', serving: 250, unit: 'ml', protein: 8.5, carbs: 12, fat: 8, calories: 154 },
      { id: 'b2', category: 'Carb', name: 'Croissant (plain)', serving: 60, unit: 'g', protein: 5, carbs: 27.5, fat: 12.6, calories: 243 },
    ],
    lunch: [],
    dinner: [
      { id: 'd1', category: 'Prot', name: 'Chicken breast, cooked', serving: 100, unit: 'g', protein: 31, carbs: 0, fat: 3.6, calories: 156.4 },
      { id: 'd2', category: 'Veg', name: 'Roasted vegetables', serving: 200, unit: 'g', protein: 3.39, carbs: 15.31, fat: 0.46, calories: 78.9 },
      { id: 'd3', category: 'Carb', name: 'Corn, sweet (cooked)', serving: 150, unit: 'g', protein: 5.1, carbs: 31.5, fat: 2.3, calories: 167.1 },
    ],
    snack: [
      { id: 's1', category: 'Prot', name: 'Greek yogurt, plain', serving: 250, unit: 'g', protein: 25, carbs: 9, fat: 2, calories: 154 },
      { id: 's2', category: 'Carb', name: 'Orange', serving: 85, unit: 'g', protein: 0.8, carbs: 10, fat: 0.1, calories: 44.1 },
      { id: 's3', category: 'Prot', name: 'Milk, regular', serving: 200, unit: 'ml', protein: 6.8, carbs: 9.6, fat: 6.4, calories: 123.2 },
    ],
    isOptimized: true
  };

  const [mealPlan, setMealPlan] = useState<MealPlan | null>(() => {
    return readJsonFromStorage<MealPlan | null>('mealPlan', MOCK_MEAL_PLAN);
  });
  
  // Initialize dailyLogs from localStorage or default to mock data
  const [dailyLogs, setDailyLogs] = useState<MealItem[]>(() => {
    const saved = readJsonFromStorage<MealItem[] | null>('dailyLogs', null);
    if (saved) {
      return saved;
    }

    // Default mock data if no local storage
    const logs: MealItem[] = [];
    const add = (items: PlanFoodItem[], type: MealItem['type']) => {
      items.forEach(item => {
        logs.push({
          id: uuidv4(),
          planId: item.id,
          name: item.name,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
          veggie: item.category === 'Veg' ? item.serving : 0,
          type: type as any,
          timestamp: Date.now(),
          category: item.category,
          serving: item.serving,
          unit: item.unit
        });
      });
    };
    
    // Only populate mock data if we really want to simulate a fresh start with data
    // For now, let's keep the mock data logic as a fallback
    const MOCK_MEAL_PLAN_DATA: MealPlan = {
      breakfast: [
        { id: 'b1', category: 'Prot', name: 'Milk, regular', serving: 250, unit: 'ml', protein: 8.5, carbs: 12, fat: 8, calories: 154 },
        { id: 'b2', category: 'Carb', name: 'Croissant (plain)', serving: 60, unit: 'g', protein: 5, carbs: 27.5, fat: 12.6, calories: 243 },
      ],
      lunch: [],
      dinner: [
        { id: 'd1', category: 'Prot', name: 'Chicken breast, cooked', serving: 100, unit: 'g', protein: 31, carbs: 0, fat: 3.6, calories: 156.4 },
        { id: 'd2', category: 'Veg', name: 'Roasted vegetables', serving: 200, unit: 'g', protein: 3.39, carbs: 15.31, fat: 0.46, calories: 78.9 },
        { id: 'd3', category: 'Carb', name: 'Corn, sweet (cooked)', serving: 150, unit: 'g', protein: 5.1, carbs: 31.5, fat: 2.3, calories: 167.1 },
      ],
      snack: [
        { id: 's1', category: 'Prot', name: 'Greek yogurt, plain', serving: 250, unit: 'g', protein: 25, carbs: 9, fat: 2, calories: 154 },
        { id: 's2', category: 'Carb', name: 'Orange', serving: 85, unit: 'g', protein: 0.8, carbs: 10, fat: 0.1, calories: 44.1 },
        { id: 's3', category: 'Prot', name: 'Milk, regular', serving: 200, unit: 'ml', protein: 6.8, carbs: 9.6, fat: 6.4, calories: 123.2 },
      ],
      isOptimized: true
    };

    add(MOCK_MEAL_PLAN_DATA.breakfast, 'breakfast');
    add(MOCK_MEAL_PLAN_DATA.dinner, 'dinner');
    add(MOCK_MEAL_PLAN_DATA.snack, 'snack');
    
    return logs;
  });

  // Custom Meal Plans State
  const [customMealPlans, setCustomMealPlans] = useState<PlanTemplate[]>(() => {
    return readJsonFromStorage<PlanTemplate[]>('customMealPlans', []);
  });

  const [deletedPlanIds, setDeletedPlanIds] = useState<string[]>(() => {
    return readJsonFromStorage<string[]>('deletedPlanIds', []);
  });

  const [chatMessages, setChatMessages] = useState<(ChatMessage & { image?: string })[]>(() => {
    const saved = readJsonFromStorage<(ChatMessage & { image?: string })[] | null>('chatMessages', null);
    if (saved) return saved;
    const initialLanguage = readJsonFromStorage<'en' | 'zh'>('app_language', 'zh');
    const firstTime = !hasChattedOnce();
    return [
      { 
        role: 'model', 
        text: getDefaultGreeting(initialLanguage, firstTime),
        suggestions: getDefaultGreetingSuggestions(initialLanguage, firstTime),
      }
    ];
  });

  const [exerciseCalories, setExerciseCalories] = useState<number>(() => {
    return readJsonFromStorage<number>('exerciseCalories', 0);
  });

  const [savedAdvice, setSavedAdviceState] = useState<string | null>(() => {
    return readJsonFromStorage<string | null>('savedAdvice', null);
  });
  const setSavedAdvice = (advice: string | null) => {
    setSavedAdviceState(advice);
    if (advice) {
      localStorage.setItem('savedAdvice', JSON.stringify(advice));
    } else {
      localStorage.removeItem('savedAdvice');
    }
  };

  const [waterLogs, setWaterLogs] = useState<WaterLog[]>(() => {
    return readJsonFromStorage<WaterLog[]>('waterLogs', []);
  });

  const [weightLogs, setWeightLogs] = useState<WeightLog[]>(() => {
    return readJsonFromStorage<WeightLog[]>('weightLogs', []);
  });

  const [language, setLanguageState] = useState<'en' | 'zh'>(() => {
    const saved = localStorage.getItem('app_language');
    return (saved as 'en' | 'zh') || 'zh'; // Default to Chinese as requested
  });

  const setLanguage = (lang: 'en' | 'zh') => {
    setLanguageState(lang);
    localStorage.setItem('app_language', lang);
  };

  // Persist mealPlan
  useEffect(() => {
    if (mealPlan) {
      localStorage.setItem('mealPlan', JSON.stringify(mealPlan));
    }
  }, [mealPlan]);

  // Persist dailyLogs to localStorage
  useEffect(() => {
    localStorage.setItem('dailyLogs', JSON.stringify(dailyLogs));
  }, [dailyLogs]);

  useEffect(() => {
    if (user) {
      localStorage.setItem('app_user', JSON.stringify(user));
    }
  }, [user]);

  // Persist customMealPlans
  useEffect(() => {
    localStorage.setItem('customMealPlans', JSON.stringify(customMealPlans));
  }, [customMealPlans]);

  // Persist deletedPlanIds
  useEffect(() => {
    localStorage.setItem('deletedPlanIds', JSON.stringify(deletedPlanIds));
  }, [deletedPlanIds]);

  // Merge custom plans and preset plans, prioritizing custom plans with the same ID
  const allPlans = useMemo(() => {
    const plansMap = new Map<string, PlanTemplate>();
    
    // Add presets first
    PRESET_PLANS.forEach(plan => {
      if (!deletedPlanIds.includes(plan.id)) {
        plansMap.set(plan.id, plan);
      }
    });
    
    // Add/Overwrite with custom plans
    customMealPlans.forEach(plan => plansMap.set(plan.id, plan));
    
    return Array.from(plansMap.values());
  }, [customMealPlans, deletedPlanIds]);

  // Persist chatMessages (exclude transient transcribing placeholders)
  useEffect(() => {
    const persistable = chatMessages.filter(m => !m.isTranscribing);
    localStorage.setItem('chatMessages', JSON.stringify(persistable));
    if (chatMessages.some(msg => msg.role === 'user')) {
      localStorage.setItem(HAS_CHATTED_ONCE_KEY, 'true');
    }
  }, [chatMessages]);

  useEffect(() => {
    // Keep the initial welcome message aligned with current language
    // as long as the user has not started chatting yet.
    setChatMessages(prev => {
      const hasUserMessage = prev.some(msg => msg.role === 'user');
      if (hasUserMessage || prev.length === 0) return prev;
      const firstModelIndex = prev.findIndex(msg => msg.role === 'model');
      if (firstModelIndex < 0) return prev;
      const firstTime = !hasChattedOnce();
      const nextText = getDefaultGreeting(language, firstTime);
      const nextSuggestions = getDefaultGreetingSuggestions(language, firstTime);
      const currentText = prev[firstModelIndex].text;
      const currentSuggestions = prev[firstModelIndex].suggestions || [];
      const sameText = currentText === nextText;
      const sameSuggestions =
        currentSuggestions.length === nextSuggestions.length &&
        currentSuggestions.every((s, idx) => s === nextSuggestions[idx]);
      if (sameText && sameSuggestions) return prev;
      const next = [...prev];
      next[firstModelIndex] = {
        ...next[firstModelIndex],
        text: nextText,
        suggestions: nextSuggestions,
      };
      return next;
    });
  }, [language]);

  // Persist exerciseCalories
  useEffect(() => {
    localStorage.setItem('exerciseCalories', JSON.stringify(exerciseCalories));
  }, [exerciseCalories]);

  // Persist waterLogs
  useEffect(() => {
    localStorage.setItem('waterLogs', JSON.stringify(waterLogs));
  }, [waterLogs]);

  // Persist weightLogs
  useEffect(() => {
    localStorage.setItem('weightLogs', JSON.stringify(weightLogs));
  }, [weightLogs]);

  const updateUser = (data: Partial<UserProfile>) => {
    setUser(prev => {
      const newUser = prev ? { ...prev, ...data } : { 
        height: 170, weight: 65, gender: 'male', age: 25, 
        dietPreference: 'none', goals: ['gut_health'], 
        activity: { type: 'mixed', intensity: 'moderate', frequency: '3-4' },
        cravings: [],
        gutSymptoms: [],
        onboardingComplete: false,
        ...data 
      } as UserProfile;
      return newUser;
    });
  };

  const completeOnboarding = () => {
    if (user) {
      if (user.weight > 0 && weightLogs.length === 0) {
        addWeightLog(user.weight);
      }
      updateUser({ onboardingComplete: true });
    }
  };

  const addLog = (item: MealItem) => {
    setDailyLogs(prev => [...prev, item]);
  };

  const addLogs = (items: MealItem[]) => {
    setDailyLogs(prev => [...prev, ...items]);
  };

  const updateLog = (updatedItem: MealItem) => {
    setDailyLogs(prev => prev.map(item => item.id === updatedItem.id ? updatedItem : item));
  };

  const removeLog = (id: string) => {
    setDailyLogs(prev => prev.filter(item => item.id !== id));
  };

  const clearLogs = () => {
    setDailyLogs([]);
  };

  const saveMealPlan = (plan: PlanTemplate) => {
    // Check if this plan already exists in either presets or custom plans (via allPlans)
    const exists = allPlans.some(p => p.id === plan.id);
    
    if (!exists && allPlans.length >= 5) {
      console.warn('Meal plan limit reached');
      return false;
    }

    setCustomMealPlans(prev => {
      const existsInPrev = prev.find(p => p.id === plan.id);
      if (existsInPrev) {
        return prev.map(p => p.id === plan.id ? plan : p);
      }
      return [...prev, plan];
    });
    return true;
  };

  const deleteMealPlan = (id: string) => {
    setCustomMealPlans(prev => prev.filter(p => p.id !== id));
    setDeletedPlanIds(prev => {
      if (!prev.includes(id)) {
        return [...prev, id];
      }
      return prev;
    });
  };

  const addWater = (amount: number) => {
    setWaterLogs(prev => [...prev, { id: uuidv4(), amount, timestamp: Date.now() }]);
  };

  const removeWater = (id: string) => {
    setWaterLogs(prev => prev.filter(w => w.id !== id));
  };

  const addWeightLog = (weight: number, note?: string) => {
    setWeightLogs(prev => [...prev, { id: uuidv4(), weight, timestamp: Date.now(), note }]);
  };

  const removeWeightLog = (id: string) => {
    setWeightLogs(prev => prev.filter(w => w.id !== id));
  };

  const todayWaterTotal = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const ts = todayStart.getTime();
    return waterLogs
      .filter(w => w.timestamp >= ts)
      .reduce((sum, w) => sum + w.amount, 0);
  }, [waterLogs]);

  const syncExerciseData = async () => {
    // This is a placeholder for real HealthKit/Google Fit integration
    // For now, we simulate a sync that adds some random exercise calories
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        // Mock: Generate a random value between 150 and 400
        const mockBurn = Math.floor(Math.random() * 250) + 150;
        setExerciseCalories(mockBurn);
        resolve();
      }, 1500);
    });
  };

  return (
    <AppContext.Provider value={{ 
      user, updateUser, completeOnboarding,
      dailyLogs, addLog, addLogs, updateLog, removeLog, clearLogs,
      mealPlan, setMealPlan,
      customMealPlans, deletedPlanIds, allPlans, saveMealPlan, deleteMealPlan,
      chatMessages, setChatMessages,
      exerciseCalories, syncExerciseData,
      savedAdvice, setSavedAdvice,
      waterLogs, addWater, removeWater, todayWaterTotal,
      weightLogs, addWeightLog, removeWeightLog,
      language, setLanguage
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
