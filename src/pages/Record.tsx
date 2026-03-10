import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useApp, MealItem, PlanFoodItem, FoodCategory } from '../context/AppContext';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { motion, AnimatePresence, PanInfo, useAnimation } from 'motion/react';
import { Beef, Wheat, LeafyGreen, Droplet, Droplets, Plus, Trash2, ChefHat, Bookmark, RefreshCw, Activity, ChevronLeft, ChevronRight } from 'lucide-react';
import AddFoodModal from '../components/AddFoodModal';
import MealPlansModal from '../components/MealPlansModal';
import SaveMealPlanModal from '../components/SaveMealPlanModal';
import { PRESET_PLANS, PlanTemplate } from '../data/mealPlans';
import { translations } from '../translations';
import { getMobilePortalTarget } from '../utils/portal';

export default function Record() {
  const { dailyLogs, mealPlan, addLog, removeLog, addLogs, allPlans, exerciseCalories, syncExerciseData, language, user, addWater, todayWaterTotal, waterLogs, removeWater } = useApp();
  const t = translations[language];
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPlansModalOpen, setIsPlansModalOpen] = useState(false);
  const [isSavePlanModalOpen, setIsSavePlanModalOpen] = useState(false);
  const [activeMealType, setActiveMealType] = useState<MealItem['type']>('breakfast');
  const [editingItem, setEditingItem] = useState<MealItem | undefined>(undefined);
  const [isSyncing, setIsSyncing] = useState(false);
  const hasSyncedRef = useRef(false);
  
  // Auto-sync on mount
  useEffect(() => {
    if (!hasSyncedRef.current && exerciseCalories === 0) {
      handleSync();
      hasSyncedRef.current = true;
    }
  }, []);

  // State for Quick Plan Apply
  const [quickPlan, setQuickPlan] = useState<PlanTemplate | null>(null);
  const [startAtConfirm, setStartAtConfirm] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const normalizeDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const isSameDay = (a: Date, b: Date) => normalizeDay(a) === normalizeDay(b);
  const filteredLogs = dailyLogs.filter(log => isSameDay(new Date(log.timestamp), selectedDate));

  const datesWithRecords = useMemo(() => {
    const s = new Set<number>();
    dailyLogs.forEach(log => s.add(normalizeDay(new Date(log.timestamp))));
    return s;
  }, [dailyLogs]);

  const getSelectedDateTimestamp = () => {
    const d = new Date(selectedDate);
    const now = new Date();
    d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    return d.getTime();
  };

  // Calculate totals from selected-day logs
  const totals = filteredLogs.reduce((acc, log) => ({
    protein: acc.protein + log.protein,
    carbs: acc.carbs + log.carbs,
    fat: acc.fat + log.fat,
    veggie: acc.veggie + log.veggie,
    calories: acc.calories + log.calories,
  }), { protein: 0, carbs: 0, fat: 0, veggie: 0, calories: 0 });

  // Mock Base Targets
  const baseTargets = { protein: 82.5, calories: 1100, fat: 36.7, carbs: 109.9, veggie: 300 };
  
  // Dynamic Calorie Target: Base + Exercise
  const dynamicCalorieTarget = baseTargets.calories + exerciseCalories;

  const data = [
    { name: t.record.protein, value: totals.protein, color: '#6366f1', target: baseTargets.protein }, 
    { name: t.record.carbs, value: totals.carbs, color: '#f59e0b', target: baseTargets.carbs },    
    { name: t.record.fat, value: totals.fat, color: '#ef4444', target: baseTargets.fat },       
    { name: t.record.veggie, value: totals.veggie, color: '#10b981', target: baseTargets.veggie },  
  ];

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncExerciseData();
    } catch (e) {
      console.error("Sync failed", e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddFood = (type: MealItem['type']) => {
    setActiveMealType(type);
    setEditingItem(undefined);
    setIsModalOpen(true);
  };

  const handleEditFood = (item: MealItem) => {
    setActiveMealType(item.type);
    setEditingItem(item);
    setIsModalOpen(true);
  };

  const handleQuickPlanClick = (plan: PlanTemplate) => {
    if (filteredLogs.length === 0) {
      // Direct apply if no logs exist (1-click)
      const newLogs: MealItem[] = plan.items.map(item => ({
        ...item,
        id: uuidv4(),
        timestamp: getSelectedDateTimestamp(),
      }));
      addLogs(newLogs);
      // Optional: Show toast here
    } else {
      // Open modal in confirm mode if logs exist (2-clicks)
      setQuickPlan(plan);
      setStartAtConfirm(true);
      setIsPlansModalOpen(true);
    }
  };

  const handleOpenPlansModal = () => {
    setQuickPlan(null);
    setStartAtConfirm(false);
    setIsPlansModalOpen(true);
  };

  // Group logs by meal type
  const logsByMeal = {
    breakfast: filteredLogs.filter(l => l.type === 'breakfast'),
    lunch: filteredLogs.filter(l => l.type === 'lunch'),
    dinner: filteredLogs.filter(l => l.type === 'dinner'),
    snack: filteredLogs.filter(l => l.type === 'snack'),
  };

  const today = new Date();
  const selectedDateLabel = isSameDay(selectedDate, today)
    ? (language === 'zh' ? '今天' : 'Today')
    : selectedDate.toLocaleDateString(language === 'en' ? 'en-US' : 'zh-CN', {
        month: 'short',
        day: 'numeric',
      });

  const monthLabel = calendarMonth.toLocaleDateString(language === 'en' ? 'en-US' : 'zh-CN', {
    year: 'numeric',
    month: 'long',
  });
  const weekdayLabels = language === 'zh' ? ['日', '一', '二', '三', '四', '五', '六'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
  const firstWeekday = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay();
  const dayCells = Array.from({ length: firstWeekday + daysInMonth }, (_, i) => (i < firstWeekday ? null : i - firstWeekday + 1));

  const openDatePicker = () => {
    setCalendarMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    setIsDatePickerOpen(true);
  };

  const shiftSelectedDate = (deltaDays: number) => {
    setIsDatePickerOpen(false);
    setSelectedDate(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() + deltaDays);
      return next;
    });
  };

  const todayStart = normalizeDay(today);
  const selectedStart = normalizeDay(selectedDate);
  const isFutureDay = selectedStart > todayStart;
  const isPastDay = selectedStart < todayStart;
  const emptyMealText = isFutureDay
    ? (language === 'zh' ? '这一天还没有安排，开始创建计划吧' : 'No plan yet for this day. Start planning now.')
    : isPastDay
      ? (language === 'zh' ? '这一天暂无饮食记录' : 'No food logs for this day.')
      : (language === 'zh' ? '还没有记录食物' : 'No food logged yet');

  return (
    <div className="h-full overflow-y-auto p-5 md:p-8 space-y-11">
      {/* Header & Stats */}
      <div>
        <header className="mb-8 flex items-center justify-between h-10">
          <div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => shiftSelectedDate(-1)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-stone-500 hover:bg-stone-100 hover:text-stone-900 transition-colors"
                aria-label={language === 'zh' ? '前一天' : 'Previous day'}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={openDatePicker}
                className="inline-flex items-center px-4 py-2 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-900 font-medium transition-colors"
              >
                <span>{selectedDateLabel}</span>
              </button>
              <button
                onClick={() => shiftSelectedDate(1)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-stone-500 hover:bg-stone-100 hover:text-stone-900 transition-colors"
                aria-label={language === 'zh' ? '后一天' : 'Next day'}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          
          {/* Header Icon - Only visible when logs exist (Quick Plans are folded) */}
          <AnimatePresence>
            {filteredLogs.length > 0 && (
              <motion.button
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                onClick={handleOpenPlansModal}
                className="w-12 h-12 flex items-center justify-center bg-white border border-stone-200 rounded-full text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-colors shadow-sm"
                title="Meal Plans"
              >
                <ChefHat size={20} strokeWidth={2.5} />
              </motion.button>
            )}
          </AnimatePresence>
        </header>

        {/* Quick Plans (Horizontal Scroll) - Only visible when no logs (Empty State) */}
        <AnimatePresence>
          {filteredLogs.length === 0 && (
            <motion.div
              initial={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0, marginBottom: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="overflow-hidden"
            >
              <div className="mb-6 -mx-4 px-4 overflow-x-auto no-scrollbar flex gap-3 pb-1">
                {allPlans.map(plan => (
                  <button
                    key={plan.id}
                    onClick={() => handleQuickPlanClick(plan)}
                    className="flex items-center gap-3 pl-2 pr-4 py-2 bg-white border border-stone-100 rounded-full shadow-sm whitespace-nowrap active:scale-95 transition-transform"
                  >
                    <div className={clsx("w-8 h-8 rounded-full flex items-center justify-center", plan.color)}>
                      {plan.isCustom ? <Bookmark size={14} /> : <plan.icon size={14} />}
                    </div>
                    <div className="text-left">
                      <div className="text-xs font-bold text-stone-900">{plan.name}</div>
                      <div className="text-[10px] text-stone-400 font-medium">
                        {Math.round(plan.items.reduce((a, b) => a + b.calories, 0))} kcal
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Calories */}
        <div className="mb-8">
           <div className="flex items-baseline justify-between mb-4">
             <div className="flex items-baseline gap-2">
               <span className="text-4xl font-serif font-medium text-stone-900">{Math.round(totals.calories)}</span>
               <span className="text-sm text-stone-400 font-medium uppercase tracking-wider">/ {dynamicCalorieTarget} KCAL</span>
             </div>
             
             {exerciseCalories > 0 ? (
               <motion.button 
                 onClick={handleSync}
                 disabled={isSyncing}
                 initial={{ opacity: 0, x: 10 }}
                 animate={{ opacity: 1, x: 0 }}
                 className="flex items-center gap-1.5 px-2 py-0.5 bg-stone-50 text-stone-400 rounded-lg border border-stone-100 hover:bg-stone-100 hover:text-stone-700 transition-all group translate-y-[1.5px]"
                 title="Sync Activity"
               >
                 <Activity size={12} className={clsx(isSyncing ? "animate-pulse" : "")} />
                 <span className="flex items-center gap-1">
                   <span className="text-xs font-mono font-bold">+{exerciseCalories}</span>
                   <span className="text-[8px] font-bold uppercase tracking-wider">Burned</span>
                 </span>
               </motion.button>
             ) : (
               <button 
                 onClick={handleSync}
                 disabled={isSyncing}
                 className="p-2 text-stone-300 hover:text-stone-600 transition-colors"
                 title="Sync Activity"
               >
                 <RefreshCw size={16} className={isSyncing ? "animate-spin" : ""} />
               </button>
             )}
           </div>

           <div className="flex items-center gap-3">
             <div className="h-2 flex-1 bg-stone-100 rounded-full overflow-hidden">
               <motion.div 
                 initial={{ width: 0 }}
                 animate={{ width: `${Math.min((totals.calories / dynamicCalorieTarget) * 100, 100)}%` }}
                 className="h-full bg-stone-900 rounded-full"
               />
             </div>
             <div className="text-sm font-medium text-stone-500 w-10 text-right">
               {Math.round((totals.calories / dynamicCalorieTarget) * 100)}%
             </div>
           </div>
        </div>

        {/* Water Tracker — inline progress bar */}
        <WaterTracker
          total={todayWaterTotal}
          target={user?.waterTarget || 2000}
          onAdd={addWater}
          waterLogs={waterLogs}
          onRemove={removeWater}
          selectedDate={selectedDate}
          isToday={isSameDay(selectedDate, today)}
          t={t}
          language={language}
        />

        {/* Nutrients Grid */}
        <div className="grid grid-cols-4 gap-4">
          {data.map((item) => {
            const rawPercent = Math.round((item.value / item.target) * 100);
            const clampedPercent = Math.min(rawPercent, 100);
            const radius = 28;
            const circumference = 2 * Math.PI * radius;
            const strokeDashoffset = circumference - (clampedPercent / 100) * circumference;
            
            return (
              <div key={item.name} className="flex flex-col items-center">
                <div className="relative w-20 h-20 flex items-center justify-center mb-2">
                  <svg viewBox="0 0 80 80" className="w-full h-full transform -rotate-90">
                    <circle
                      cx="40"
                      cy="40"
                      r={radius}
                      stroke="#f5f5f4"
                      strokeWidth="6"
                      fill="none"
                    />
                    <motion.circle
                      cx="40"
                      cy="40"
                      r={radius}
                      stroke={item.color}
                      strokeWidth="6"
                      fill="none"
                      strokeDasharray={circumference}
                      initial={{ strokeDashoffset: circumference }}
                      animate={{ strokeDashoffset }}
                      transition={{ duration: 1, ease: "easeOut" }}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[16px] font-semibold text-stone-900">{rawPercent}<span className="text-[12px] font-normal">%</span></span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                   <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                   <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">{item.name}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Meal Sections */}
      <div className="space-y-8">
            <>
              <MealCard 
                id="breakfast"
                title={t.record.meals.breakfast} 
                items={logsByMeal.breakfast} 
                onEdit={handleEditFood}
                onRemove={removeLog}
                emptyText={emptyMealText}
              />
              <MealCard 
                id="lunch"
                title={t.record.meals.lunch} 
                items={logsByMeal.lunch} 
                onEdit={handleEditFood}
                onRemove={removeLog}
                emptyText={emptyMealText}
              />
              <MealCard 
                id="dinner"
                title={t.record.meals.dinner} 
                items={logsByMeal.dinner} 
                onEdit={handleEditFood}
                onRemove={removeLog}
                emptyText={emptyMealText}
              />
              <MealCard 
                id="snack"
                title={t.record.meals.snack} 
                items={logsByMeal.snack} 
                onEdit={handleEditFood}
                onRemove={removeLog}
                emptyText={emptyMealText}
              />

              {/* Save as Meal Plan Button */}
              {filteredLogs.length > 0 && (
                <div className="pt-4 pb-8">
                  <button
                    onClick={() => setIsSavePlanModalOpen(true)}
                    className="w-full py-3 rounded-xl border-2 border-dashed border-stone-200 text-stone-400 hover:border-stone-300 hover:text-stone-500 hover:bg-stone-50 transition-all flex items-center justify-center gap-2 text-sm font-medium"
                  >
                    <Bookmark size={18} />
                    Save as Meal Plan
                  </button>
                </div>
              )}
            </>
      </div>

      {/* Add Food Modal */}
      <AddFoodModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        mealType={activeMealType}
        initialData={editingItem}
        defaultTimestamp={getSelectedDateTimestamp()}
      />

      {/* Meal Plans Modal */}
      <MealPlansModal
        isOpen={isPlansModalOpen}
        onClose={() => setIsPlansModalOpen(false)}
        initialPlan={quickPlan}
        startAtConfirm={startAtConfirm}
      />

      {/* Save Meal Plan Modal */}
      <SaveMealPlanModal
        isOpen={isSavePlanModalOpen}
        onClose={() => setIsSavePlanModalOpen(false)}
      />

      {/* Floating Action Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => {
          // Determine meal type based on current time
          const hour = new Date().getHours();
          let currentMeal: MealItem['type'] = 'snack';
          if (hour >= 5 && hour < 11) currentMeal = 'breakfast';
          else if (hour >= 11 && hour < 16) currentMeal = 'lunch';
          else if (hour >= 16 && hour < 22) currentMeal = 'dinner';
          
          handleAddFood(currentMeal);
        }}
        className="fixed bottom-24 left-1/2 -translate-x-1/2 w-12 h-12 bg-stone-900 text-white rounded-full shadow-lg shadow-stone-300 flex items-center justify-center z-40"
      >
        <Plus size={24} />
      </motion.button>

      {/* Date Picker Modal */}
      {createPortal(
        <AnimatePresence>
          {isDatePickerOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsDatePickerOpen(false)}
                className="absolute inset-0 bg-black/35 z-[9998] backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 40 }}
                className="absolute left-1/2 -translate-x-1/2 top-20 w-[92%] max-w-md bg-white rounded-3xl shadow-xl z-[9999] p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                    className="p-2 rounded-full hover:bg-stone-100"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <div className="text-stone-900 font-medium">{monthLabel}</div>
                  <button
                    onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                    className="p-2 rounded-full hover:bg-stone-100"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-1 mb-2">
                  {weekdayLabels.map(day => (
                    <div key={day} className="text-center text-xs text-stone-400 py-1">{day}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {dayCells.map((day, idx) => {
                    if (!day) return <div key={`empty-${idx}`} className="h-9" />;
                    const d = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
                    const isSelected = isSameDay(d, selectedDate);
                    const isToday = isSameDay(d, today);
                    const hasRecord = datesWithRecords.has(normalizeDay(d));
                    return (
                      <button
                        key={day}
                        onClick={() => {
                          setSelectedDate(d);
                          setIsDatePickerOpen(false);
                        }}
                        className={clsx(
                          "h-9 rounded-full text-sm transition-colors",
                          isSelected
                            ? "bg-stone-900 text-white"
                            : isToday
                              ? "bg-stone-200 text-stone-900 font-semibold"
                              : hasRecord
                                ? "bg-stone-100 text-stone-900 font-medium"
                                : "text-stone-400 hover:bg-stone-50"
                        )}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        getMobilePortalTarget()
      )}
    </div>
  );
}

function MealCard({ id, title, items, onEdit, onRemove, emptyText }: { 
  id: string,
  title: string, 
  items: MealItem[], 
  onEdit: (item: MealItem) => void,
  onRemove: (id: string) => void,
  emptyText: string
}) {
  return (
    <div id={id} className="scroll-mt-6">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-serif text-xl font-medium text-stone-500 tracking-tight">{title}</h3>
        {items.length > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-stone-100 text-xs font-medium text-stone-500">
            {Math.round(items.reduce((sum, item) => sum + item.calories, 0))} kcal
          </span>
        )}
      </div>
      
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
        {/* Column Headers */}
        <div className="grid grid-cols-[auto_1fr_auto] gap-4 px-4 py-3 bg-stone-50 border-b border-stone-100 text-[10px] font-bold text-stone-400 uppercase tracking-wider">
          <div className="w-6"></div>
          <div>Food</div>
          <div className="text-right">Details</div>
        </div>

        {/* Items */}
        <div className="divide-y divide-stone-50">
          <AnimatePresence initial={false}>
            {items.length > 0 ? items.map(item => (
              <SwipeableItem 
                key={item.id} 
                item={item} 
                onEdit={onEdit} 
                onRemove={onRemove} 
              />
            )) : (
              <div className="px-4 py-6 text-center text-stone-400 text-sm italic">
                {emptyText}
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function NutrientRings({ data, waterTotal, waterTarget, onAddWater, isToday, t, language }: {
  data: { name: string; value: number; color: string; target: number }[];
  waterTotal: number;
  waterTarget: number;
  onAddWater: (amount: number) => void;
  isToday: boolean;
  t: any;
  language: 'en' | 'zh';
}) {
  const [showWaterOptions, setShowWaterOptions] = useState(false);
  const waterLabel = t.record.water.label;
  const waterPercent = Math.min(Math.round((waterTotal / waterTarget) * 100), 100);
  const allItems = [
    ...data,
    { name: waterLabel, value: waterTotal, color: '#38bdf8', target: waterTarget, isWater: true },
  ];

  return (
    <div className="grid grid-cols-5 gap-2">
      {allItems.map((item) => {
        const rawPercent = Math.round((item.value / item.target) * 100);
        const clampedPercent = Math.min(rawPercent, 100);
        const radius = 26;
        const circumference = 2 * Math.PI * radius;
        const strokeDashoffset = circumference - (clampedPercent / 100) * circumference;
        const isWater = 'isWater' in item && item.isWater;

        return (
          <div key={item.name} className="flex flex-col items-center relative">
            <div
              className={clsx(
                "relative w-[68px] h-[68px] flex items-center justify-center mb-2",
                isWater && isToday && "cursor-pointer"
              )}
              onClick={() => isWater && isToday && setShowWaterOptions(!showWaterOptions)}
            >
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="34" cy="34" r={radius} stroke="#f5f5f4" strokeWidth="5" fill="none" />
                <motion.circle
                  cx="34" cy="34" r={radius}
                  stroke={item.color}
                  strokeWidth="5"
                  fill="none"
                  strokeDasharray={circumference}
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold text-stone-900">{rawPercent}%</span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">{item.name}</span>
            </div>

            {isWater && isToday && (
              <AnimatePresence>
                {showWaterOptions && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: -4 }}
                    className="absolute top-full mt-1 flex flex-col gap-1 z-20"
                  >
                    {[250, 500].map(ml => (
                      <button
                        key={ml}
                        onClick={(e) => { e.stopPropagation(); onAddWater(ml); setShowWaterOptions(false); }}
                        className="px-2 py-1 bg-white border border-stone-200 rounded-full text-[10px] font-medium text-stone-600 hover:bg-sky-50 hover:border-sky-200 hover:text-sky-600 shadow-sm whitespace-nowrap transition-colors"
                      >
                        +{ml}ml
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>
        );
      })}
    </div>
  );
}

function WaterTracker({ total, target, onAdd, waterLogs, onRemove, selectedDate, isToday, t, language }: {
  total: number;
  target: number;
  onAdd: (amount: number) => void;
  waterLogs: { id: string; amount: number; timestamp: number }[];
  onRemove: (id: string) => void;
  selectedDate: Date;
  isToday: boolean;
  t: any;
  language: 'en' | 'zh';
}) {
  const [showOptions, setShowOptions] = useState(false);

  const normalizeDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayStart = normalizeDay(selectedDate);
  const dayEnd = dayStart + 86400000;
  const dayLogs = waterLogs.filter(w => w.timestamp >= dayStart && w.timestamp < dayEnd);
  const dayTotal = dayLogs.reduce((sum, w) => sum + w.amount, 0);
  const displayTotal = isToday ? total : dayTotal;
  const percent = Math.min(Math.round((displayTotal / target) * 100), 100);
  const lastLog = dayLogs.length > 0 ? dayLogs[dayLogs.length - 1] : null;

  const handleQuickAdd = (amount: number) => {
    onAdd(amount);
    setShowOptions(false);
  };

  const handleUndo = () => {
    if (lastLog) onRemove(lastLog.id);
  };

  return (
    <div className="mb-6 relative">
      <div className="flex items-center gap-3">
        <Droplets size={14} className="text-sky-400 shrink-0" />
        <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden min-w-0">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percent}%` }}
            className="h-full bg-sky-300 rounded-full"
          />
        </div>
        {isToday && (
          <button
            onClick={() => setShowOptions(!showOptions)}
            className="w-6 h-6 rounded-full bg-sky-50 text-sky-400 hover:bg-sky-100 hover:text-sky-500 flex items-center justify-center transition-colors shrink-0"
          >
            <Plus size={12} />
          </button>
        )}
        <span className="text-sm font-medium text-stone-500 w-10 text-right shrink-0">
          {percent}%
        </span>
      </div>
      <AnimatePresence>
        {showOptions && isToday && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -2 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -2 }}
            className="absolute right-12 top-full mt-1.5 flex gap-1.5 z-20"
          >
            {[250, 500].map(ml => (
              <button
                key={ml}
                onClick={() => handleQuickAdd(ml)}
                className="px-2.5 py-1 bg-white border border-stone-200 rounded-full text-[10px] font-medium text-stone-600 hover:bg-sky-50 hover:border-sky-200 hover:text-sky-600 shadow-sm whitespace-nowrap transition-colors"
              >
                +{ml}ml
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SwipeableItem({ item, onEdit, onRemove }: { 
  item: MealItem, 
  onEdit: (item: MealItem) => void, 
  onRemove: (id: string) => void,
  key?: string | number
}) {
  const controls = useAnimation();
  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Category Icons
  const CatIcon = {
    'Prot': Beef,
    'Veg': LeafyGreen,
    'Carb': Wheat,
    'Fat': Droplet
  }[item.category] || LeafyGreen;

  const iconColors = {
    'Prot': 'text-indigo-700 bg-indigo-100',
    'Veg': 'text-emerald-600 bg-emerald-100',
    'Carb': 'text-amber-600 bg-amber-100',
    'Fat': 'text-red-600 bg-red-100',
  };

  return (
    <motion.div
      className="relative bg-red-500 overflow-hidden"
      exit={{ height: 0, opacity: 0 }}
    >
      {/* Delete Button (Background) */}
      <button
        onClick={() => onRemove(item.id)}
        className="absolute inset-y-0 right-0 w-20 flex items-center justify-center text-white z-0"
      >
        <Trash2 size={20} />
      </button>

      {/* Content */}
      <motion.div
        drag="x"
        dragConstraints={{ left: -80, right: 0 }}
        dragElastic={0.1}
        animate={controls}
        onDragEnd={(e, { offset }) => {
          if (!isMounted.current) return;
          if (offset.x < -40) {
            controls.start({ x: -80 });
          } else {
            controls.start({ x: 0 });
          }
        }}
        onClick={(e) => {
          // If we are dragged open, clicking should close it instead of selecting
          const currentX = (controls as any)?.current?.x?.get() || 0;
          if (currentX < -10) {
            e.stopPropagation();
            controls.start({ x: 0 });
          } else {
            onEdit(item);
          }
        }}
        className="relative grid grid-cols-[auto_1fr_auto] gap-4 px-4 py-4 items-start bg-white cursor-pointer active:bg-stone-50 z-10"
      >
        {/* Category Icon */}
        <div className={clsx(
          "w-6 h-6 rounded-full flex items-center justify-center mt-0.5",
          iconColors[item.category] || 'bg-stone-100 text-stone-500'
        )}>
          <CatIcon size={14} strokeWidth={2.5} />
        </div>

        {/* Name & Serving */}
        <div className="min-w-0">
          <div className="font-medium text-stone-900 text-sm leading-snug mb-1">
            {item.name}
          </div>
          <div className="text-xs text-stone-500 font-mono">
            {item.serving} {item.unit}
          </div>
        </div>

        {/* Macros & Kcal */}
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-3 text-xs font-mono">
            {item.protein > 0 && (
              <div className="flex items-center gap-1 text-indigo-600" title="Protein">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                <span>{Math.round(item.protein)}</span>
              </div>
            )}
            {item.carbs > 0 && (
              <div className="flex items-center gap-1 text-amber-600" title="Carbs">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span>{Math.round(item.carbs)}</span>
              </div>
            )}
            {item.fat > 0 && (
              <div className="flex items-center gap-1 text-red-600" title="Fat">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                <span>{Math.round(item.fat)}</span>
              </div>
            )}
          </div>
          <div className="text-stone-900 font-bold text-xs">
            {Math.round(item.calories)} kcal
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
