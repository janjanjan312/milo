import { useState, useRef, useEffect, ChangeEvent, FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Camera, Loader2 } from 'lucide-react';
import { useApp, MealItem, FoodCategory } from '../context/AppContext';
import { v4 as uuidv4 } from 'uuid';
import { translations } from '../translations';
import { getMobilePortalTarget } from '../utils/portal';
import { estimateNutritionFromDB } from '../services/foodDatabase';
import { estimateNutritionByAI } from '../services/ai';

interface AddFoodModalProps {
  isOpen: boolean;
  onClose: () => void;
  mealType: MealItem['type'];
  initialData?: MealItem;
  defaultTimestamp?: number;
}

export default function AddFoodModal({ isOpen, onClose, mealType, initialData, defaultTimestamp }: AddFoodModalProps) {
  const { addLog, updateLog, language } = useApp();
  const t = translations[language];
  const [mode, setMode] = useState<'manual' | 'camera'>('manual');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [selectedMealType, setSelectedMealType] = useState<MealItem['type']>(mealType);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setName(initialData.name);
        setAmount(initialData.serving.toString());
        setUnit(initialData.unit);
        setCategory(initialData.category);
        setSelectedMealType(initialData.type);
      } else {
        setSelectedMealType(mealType);
        resetForm();
      }
    }
  }, [isOpen, mealType, initialData]);

  // Form State
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('g');
  const [category, setCategory] = useState<FoodCategory>('Carb');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');

  const resetForm = () => {
    setName('');
    setAmount('');
    setUnit('g');
    setCategory('Carb');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
    setMode('manual');
    setIsAnalyzing(false);
    setAiEstimate(null);
    setAiEstimating(false);
    setAiFailed(false);
    aiAbortRef.current?.abort();
    aiRequestRef.current = '';
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Simulate AI Analysis
    setIsAnalyzing(true);
    setTimeout(() => {
      setIsAnalyzing(false);
      // Mock result
      setName('Grilled Salmon Salad');
      setAmount('350');
      setUnit('g');
      setCategory('Prot');
      setCalories('450');
      setProtein('35');
      setCarbs('12');
      setFat('28');
    }, 2000);
  };

  const [aiEstimate, setAiEstimate] = useState<{ kcal: number; protein: number; fat: number; carbs: number; fiber: number } | null>(null);
  const [aiEstimating, setAiEstimating] = useState(false);
  const [aiFailed, setAiFailed] = useState(false);
  const aiRequestRef = useRef<string>('');
  const aiAbortRef = useRef<AbortController | null>(null);

  const triggerAiEstimate = (foodName: string, foodUnit: string, lang: 'en' | 'zh') => {
    aiAbortRef.current?.abort();
    const ac = new AbortController();
    aiAbortRef.current = ac;
    const key = `${foodName}::${foodUnit}`;
    aiRequestRef.current = key;

    setAiEstimating(true);
    setAiFailed(false);
    estimateNutritionByAI(foodName, lang, ac.signal).then(result => {
      if (aiRequestRef.current === key && !ac.signal.aborted) {
        setAiEstimate(result);
        setAiEstimating(false);
        setAiFailed(!result);
      }
    }).catch((err) => {
      if (err?.name === 'AbortError') return;
      if (aiRequestRef.current === key) {
        setAiEstimating(false);
        setAiFailed(true);
      }
    });
  };

  useEffect(() => {
    if (!name.trim()) {
      setAiEstimate(null);
      setAiFailed(false);
      return;
    }

    const dbResult = estimateNutritionFromDB(name, 100, unit);
    if (dbResult.matched) {
      setAiEstimate(null);
      setAiFailed(false);
      return;
    }

    const key = `${name}::${unit}`;
    if (aiRequestRef.current === key) return;

    const timer = setTimeout(() => triggerAiEstimate(name, unit, language), 300);

    return () => {
      clearTimeout(timer);
    };
  }, [name, unit, language]);

  useEffect(() => {
    return () => { aiAbortRef.current?.abort(); };
  }, []);

  const estimateNutrition = (name: string, amount: string) => {
    const amt = Number(amount) || 100;

    const dbResult = estimateNutritionFromDB(name, amt, unit);
    if (dbResult.matched) return dbResult;

    if (aiEstimate) {
      const factor = amt / 100;
      let category: FoodCategory = 'Carb';
      if (aiEstimate.kcal < 50) {
        category = 'Veg';
      } else if (aiEstimate.protein >= aiEstimate.carbs && aiEstimate.protein >= aiEstimate.fat) {
        category = 'Prot';
      } else if (aiEstimate.fat >= aiEstimate.protein && aiEstimate.fat >= aiEstimate.carbs) {
        category = 'Fat';
      }

      return {
        calories: Math.round(aiEstimate.kcal * factor),
        protein: Math.round(aiEstimate.protein * factor * 10) / 10,
        carbs: Math.round(aiEstimate.carbs * factor * 10) / 10,
        fat: Math.round(aiEstimate.fat * factor * 10) / 10,
        category,
        matched: true,
      };
    }

    return { calories: 0, protein: 0, carbs: 0, fat: 0, category: 'Carb' as FoodCategory, matched: false };
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    
    const nutrition = estimateNutrition(name, amount);

    const logData = {
      id: initialData ? initialData.id : uuidv4(),
      name: name || 'Unknown Food',
      calories: nutrition.calories,
      protein: nutrition.protein,
      carbs: nutrition.carbs,
      fat: nutrition.fat,
      veggie: nutrition.category === 'Veg' ? Number(amount) : 0,
      type: selectedMealType,
      timestamp: initialData ? initialData.timestamp : (defaultTimestamp ?? Date.now()),
      category: nutrition.category,
      serving: Number(amount) || 0,
      unit
    };

    if (initialData) {
      updateLog(logData);
    } else {
      addLog(logData);
    }

    handleClose();
  };

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/40 z-[9998] backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="absolute inset-x-0 bottom-0 z-[9999] bg-white rounded-t-3xl shadow-xl max-h-[90%] overflow-y-auto"
          >
            <div className="p-6 space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-serif text-stone-900">{initialData ? t.addFood.edit : t.addFood.add}</h2>
                <button 
                  onClick={handleClose}
                  className="p-2 hover:bg-stone-100 rounded-full transition-colors"
                >
                  <X size={20} className="text-stone-500" />
                </button>
              </div>

              {/* Meal Type Selector */}
              <div className="grid grid-cols-4 gap-2">
                {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSelectedMealType(type)}
                    className={clsx(
                      "py-2 rounded-full text-xs font-bold capitalize transition-colors text-center",
                      selectedMealType === type
                        ? "bg-stone-900 text-white shadow-md"
                        : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                    )}
                  >
                    {t.record.meals[type as keyof typeof t.record.meals]}
                  </button>
                ))}
              </div>

              {/* Analysis Loading State */}
              {isAnalyzing && (
                <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
                  <Loader2 size={32} className="text-stone-900 animate-spin" />
                  <p className="text-stone-500 font-medium">{t.addFood.analyzing}</p>
                </div>
              )}

              {/* Form */}
              {!isAnalyzing && (
                <form onSubmit={handleSubmit} className="space-y-6 pt-2">
                  <div>
                    <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-1.5">{t.addFood.name}</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder={language === 'en' ? "e.g. Grilled Chicken Salad" : "例如：烤鸡肉沙拉"}
                        className="w-full p-3 pr-10 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900 transition-all"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-stone-300 hover:text-stone-600 transition-colors"
                      >
                        <Camera size={18} />
                        <input
                          type="file"
                          ref={cameraInputRef}
                          className="hidden"
                          accept="image/*"
                          multiple
                          onChange={handleFileUpload}
                        />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-1.5">{t.addFood.amount}</label>
                      <input
                        type="number"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        placeholder="0"
                        className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900 transition-all"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-1.5">{t.addFood.unit}</label>
                      <select
                        value={unit}
                        onChange={e => setUnit(e.target.value)}
                        className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900 transition-all appearance-none"
                      >
                        <option value="g">{t.addFood.units.g}</option>
                        <option value="ml">{t.addFood.units.ml}</option>
                        <option value="oz">{t.addFood.units.oz}</option>
                        <option value="cup">{t.addFood.units.cup}</option>
                        <option value="pcs">{t.addFood.units.pcs}</option>
                      </select>
                    </div>
                  </div>

                  {/* Auto-calculated Info Preview */}
                  {(name || amount) && (() => {
                    const est = estimateNutrition(name, amount);
                    const showValues = est.matched || (!aiEstimating && (est.calories > 0));
                    return (
                      <div className="bg-stone-50 rounded-xl p-4 border border-stone-100">
                        <div className="flex items-center gap-2 mb-3">
                          {aiEstimating ? (
                            <Loader2 size={14} className="text-stone-500 animate-spin" />
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-stone-900" />
                          )}
                          <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">
                            {aiEstimating
                              ? (language === 'zh' ? 'AI 估算中…' : 'AI estimating…')
                              : t.addFood.estimate}
                          </span>
                        </div>
                        {showValues ? (
                          <div className="grid grid-cols-4 gap-2 text-center">
                            <div>
                              <div className="text-lg font-bold text-stone-900">{est.calories}</div>
                              <div className="text-[10px] text-stone-400 font-bold uppercase">{t.record.calories}</div>
                            </div>
                            <div>
                              <div className="text-lg font-bold text-stone-900">{est.protein}</div>
                              <div className="text-[10px] text-stone-400 font-bold uppercase">{t.record.protein}</div>
                            </div>
                            <div>
                              <div className="text-lg font-bold text-amber-600">{est.carbs}</div>
                              <div className="text-[10px] text-stone-400 font-bold uppercase">{t.record.carbs}</div>
                            </div>
                            <div>
                              <div className="text-lg font-bold text-red-600">{est.fat}</div>
                              <div className="text-[10px] text-stone-400 font-bold uppercase">{t.record.fat}</div>
                            </div>
                          </div>
                        ) : aiEstimating ? (
                          <div className="grid grid-cols-4 gap-2 text-center animate-pulse">
                            {[t.record.calories, t.record.protein, t.record.carbs, t.record.fat].map((label) => (
                              <div key={label}>
                                <div className="h-6 w-10 mx-auto bg-stone-200 rounded mb-1" />
                                <div className="text-[10px] text-stone-400 font-bold uppercase">{label}</div>
                              </div>
                            ))}
                          </div>
                        ) : aiFailed ? (
                          <div className="text-center py-2 flex flex-col items-center gap-1">
                            <span className="text-sm text-stone-400">
                              {language === 'zh' ? '查询失败，请重试' : 'Query failed, please retry'}
                            </span>
                            <button
                              type="button"
                              onClick={() => triggerAiEstimate(name, unit, language)}
                              className="text-xs text-stone-600 underline underline-offset-2"
                            >
                              {language === 'zh' ? '重新查询' : 'Retry'}
                            </button>
                          </div>
                        ) : (
                          <div className="text-center text-sm text-stone-400 py-2">
                            {language === 'zh' ? '未找到营养数据' : 'No nutrition data found'}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <button
                    type="submit"
                    className="w-full py-4 bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-medium shadow-lg shadow-stone-200 transition-all flex items-center justify-center gap-2"
                  >
                    {initialData ? t.addFood.update : t.addFood.add}
                  </button>
                </form>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, getMobilePortalTarget());
}

// Helper for clsx if not imported
function clsx(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}
