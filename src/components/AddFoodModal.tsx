import { useState, useRef, useEffect, ChangeEvent, FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Camera, Upload, Loader2 } from 'lucide-react';
import { useApp, MealItem, FoodCategory } from '../context/AppContext';
import { v4 as uuidv4 } from 'uuid';
import { translations } from '../translations';
import { getMobilePortalTarget } from '../utils/portal';
import { estimateNutritionFromDB } from '../services/foodDatabase';

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
  const uploadInputRef = useRef<HTMLInputElement>(null);
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

  const estimateNutrition = (name: string, amount: string) => {
    const amt = Number(amount) || 100;

    const dbResult = estimateNutritionFromDB(name, amt, unit);
    if (dbResult.matched) {
      return dbResult;
    }

    const factor = amt / 100;
    let base = { calories: 150, protein: 10, carbs: 15, fat: 5, category: 'Carb' as FoodCategory };

    const lowerName = name.toLowerCase();
    if (lowerName.includes('chicken') || lowerName.includes('beef') || lowerName.includes('fish') || lowerName.includes('egg') ||
        lowerName.includes('鸡') || lowerName.includes('牛') || lowerName.includes('鱼') || lowerName.includes('蛋')) {
      base = { calories: 165, protein: 31, carbs: 0, fat: 3.6, category: 'Prot' };
    } else if (lowerName.includes('rice') || lowerName.includes('bread') || lowerName.includes('pasta') || lowerName.includes('potato') ||
               lowerName.includes('米') || lowerName.includes('面') || lowerName.includes('馒头') || lowerName.includes('土豆')) {
      base = { calories: 130, protein: 2.7, carbs: 28, fat: 0.3, category: 'Carb' };
    } else if (lowerName.includes('salad') || lowerName.includes('vegetable') || lowerName.includes('broccoli') ||
               lowerName.includes('菜') || lowerName.includes('蔬') || lowerName.includes('生菜')) {
      base = { calories: 35, protein: 2, carbs: 5, fat: 0.2, category: 'Veg' };
    } else if (lowerName.includes('oil') || lowerName.includes('nut') || lowerName.includes('avocado') ||
               lowerName.includes('油') || lowerName.includes('坚果') || lowerName.includes('牛油果')) {
      base = { calories: 600, protein: 15, carbs: 10, fat: 55, category: 'Fat' };
    }

    return {
      calories: Math.round(base.calories * factor),
      protein: Math.round(base.protein * factor),
      carbs: Math.round(base.carbs * factor),
      fat: Math.round(base.fat * factor),
      category: base.category,
    };
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

              {/* Action Tabs - Only show if no data yet */}
              {(!name && !amount) && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-stone-200 hover:border-stone-900 hover:bg-stone-50 transition-all group bg-stone-50"
                  >
                    <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Camera size={20} className="text-stone-900" />
                    </div>
                    <span className="text-sm font-bold text-stone-900">{t.addFood.camera}</span>
                    <input 
                      type="file" 
                      ref={cameraInputRef} 
                      className="hidden" 
                      accept="image/*"
                      capture="environment"
                      onChange={handleFileUpload}
                    />
                  </button>

                  <button
                    onClick={() => uploadInputRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-stone-200 hover:border-stone-900 hover:bg-stone-50 transition-all group bg-stone-50"
                  >
                    <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Upload size={20} className="text-stone-900" />
                    </div>
                    <span className="text-sm font-bold text-stone-900">{t.addFood.upload}</span>
                    <input 
                      type="file" 
                      ref={uploadInputRef} 
                      className="hidden" 
                      accept="image/*"
                      onChange={handleFileUpload}
                    />
                  </button>
                </div>
              )}

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
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder={language === 'en' ? "e.g. Grilled Chicken Salad" : "例如：烤鸡肉沙拉"}
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900 transition-all"
                      required
                    />
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
                  {(name || amount) && (
                    <div className="bg-stone-50 rounded-xl p-4 border border-stone-100">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 rounded-full bg-stone-900 animate-pulse" />
                        <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">{t.addFood.estimate}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div>
                          <div className="text-lg font-bold text-stone-900">{estimateNutrition(name, amount).calories}</div>
                          <div className="text-[10px] text-stone-400 font-bold uppercase">{t.record.calories}</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-stone-900">{estimateNutrition(name, amount).protein}</div>
                          <div className="text-[10px] text-stone-400 font-bold uppercase">{t.record.protein}</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-amber-600">{estimateNutrition(name, amount).carbs}</div>
                          <div className="text-[10px] text-stone-400 font-bold uppercase">{t.record.carbs}</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-red-600">{estimateNutrition(name, amount).fat}</div>
                          <div className="text-[10px] text-stone-400 font-bold uppercase">{t.record.fat}</div>
                        </div>
                      </div>
                    </div>
                  )}

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
