import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useAnimation } from 'motion/react';
import { X, ChevronRight, Check, Flame, Zap, Leaf, ArrowRightLeft, Bookmark, Trash2 } from 'lucide-react';
import { useApp, MealItem, FoodCategory, PlanTemplate } from '../context/AppContext';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { translations } from '../translations';
import { getMobilePortalTarget } from '../utils/portal';

interface MealPlansModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPlan?: PlanTemplate | null;
  startAtConfirm?: boolean;
}

export default function MealPlansModal({ isOpen, onClose, initialPlan }: MealPlansModalProps) {
  const { addLogs, clearLogs, customMealPlans, deletedPlanIds, deleteMealPlan, allPlans, language } = useApp();
  const t = translations[language];
  const [selectedPlan, setSelectedPlan] = useState<PlanTemplate | null>(null);

  // Reset or initialize state when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialPlan) {
        setSelectedPlan(initialPlan);
      } else {
        setSelectedPlan(null);
      }
    }
  }, [isOpen, initialPlan]);

  const handleApplyPlan = (overwrite: boolean) => {
    if (!selectedPlan) return;

    if (overwrite) {
      clearLogs();
    }

    const newLogs: MealItem[] = selectedPlan.items.map(item => ({
      ...item,
      id: uuidv4(),
      timestamp: Date.now(),
    }));

    addLogs(newLogs);
    onClose();
    setSelectedPlan(null);
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
            onClick={onClose}
            className="absolute inset-0 bg-black/40 z-[9998] backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="absolute inset-x-0 bottom-0 z-[9999] bg-white rounded-t-3xl shadow-xl max-h-[85%] flex flex-col"
          >
            {/* Header */}
            <div className="p-5 pb-3 border-b border-stone-100 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-lg font-serif text-stone-900">{t.mealPlans.title}</h2>
              </div>
              <button 
                onClick={onClose}
                className="p-1.5 hover:bg-stone-100 rounded-full transition-colors"
              >
                <X size={20} className="text-stone-500" />
              </button>
            </div>

            {/* Content */}
            {!selectedPlan ? (
              <div className="overflow-y-auto p-5 min-h-[420px]">
                {allPlans.length > 0 ? (
                  <div className="space-y-3">
                    {allPlans.map(plan => (
                      <SwipeablePlanItem 
                        key={plan.id} 
                        plan={plan} 
                        onClick={() => setSelectedPlan(plan)}
                        onDelete={() => deleteMealPlan(plan.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full min-h-[360px] text-center">
                    <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mb-4">
                      <Bookmark size={28} className="text-stone-300" />
                    </div>
                    <p className="text-base font-medium text-stone-700 mb-2">
                      {language === 'zh' ? '饮食计划待添加' : 'No meal plans yet'}
                    </p>
                    <p className="text-sm text-stone-400 max-w-[220px]">
                      {language === 'zh' ? '请在对话页面中点击「定制饮食计划」按钮' : 'Tap "Generate Plan" on the chat page to create one'}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Scrollable plan details */}
                <div className="flex-1 overflow-y-auto p-5 min-h-0">
                  <button 
                    onClick={() => setSelectedPlan(null)}
                    className="text-xs font-medium text-stone-500 hover:text-stone-900 mb-4 flex items-center gap-1"
                  >
                    &larr; {t.mealPlans.back}
                  </button>

                  <div className="flex items-center gap-4 mb-5">
                    <div className={clsx("w-14 h-14 rounded-2xl flex items-center justify-center shrink-0", selectedPlan.color)}>
                      {selectedPlan.isCustom ? <Bookmark size={28} /> : <selectedPlan.icon size={28} />}
                    </div>
                    <div>
                      <h3 className="text-xl font-serif text-stone-900 leading-tight">{selectedPlan.name}</h3>
                      <p className="text-xs text-stone-500 mt-0.5">{selectedPlan.description}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 p-3 bg-stone-50 rounded-xl border border-stone-100 mb-5">
                     {[
                       { label: t.record.calories, value: selectedPlan.items.reduce((a, b) => a + b.calories, 0) },
                       { label: t.record.protein, value: selectedPlan.items.reduce((a, b) => a + b.protein, 0) },
                       { label: t.record.carbs, value: selectedPlan.items.reduce((a, b) => a + b.carbs, 0) },
                       { label: t.record.fat, value: selectedPlan.items.reduce((a, b) => a + b.fat, 0) },
                     ].map(stat => (
                       <div key={stat.label} className="text-center">
                         <div className="text-base font-bold text-stone-900">{Math.round(stat.value)}</div>
                         <div className="text-[9px] font-bold text-stone-400 uppercase">{stat.label}</div>
                       </div>
                     ))}
                  </div>

                  <div className="space-y-2">
                    {selectedPlan.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2.5 bg-white border border-stone-100 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 bg-stone-100 rounded text-stone-500 w-14 text-center">
                            {t.record.meals[item.type as keyof typeof t.record.meals]}
                          </span>
                          <span className="text-sm font-medium text-stone-900 truncate max-w-[160px]">{item.name}</span>
                        </div>
                        <span className="text-xs font-mono text-stone-500 shrink-0">{Math.round(item.calories)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions - fixed at bottom outside scroll area */}
                <div className="p-5 pt-3 border-t border-stone-100 flex gap-3 shrink-0">
                  <button
                    onClick={() => handleApplyPlan(true)}
                    className="px-4 h-14 rounded-xl bg-stone-100 text-stone-500 hover:bg-red-50 hover:text-red-600 font-medium text-sm transition-colors shrink-0 min-w-[80px]"
                    title={t.mealPlans.replaceConfirm}
                  >
                    {t.mealPlans.replace}
                  </button>
                  
                  <button
                    onClick={() => handleApplyPlan(false)}
                    className="flex-1 h-14 bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-medium text-sm shadow-lg shadow-stone-200 transition-all flex items-center justify-center gap-2"
                  >
                    <Check size={20} />
                    {t.mealPlans.addToToday}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, getMobilePortalTarget());
}

function SwipeablePlanItem({ plan, onClick, onDelete }: { 
  plan: PlanTemplate, 
  onClick: () => void, 
  onDelete?: () => void 
}) {
  const controls = useAnimation();
  const PlanIcon = plan.isCustom ? Bookmark : plan.icon;
  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  return (
    <motion.div
      className="relative bg-red-500 rounded-2xl overflow-hidden"
      exit={{ height: 0, opacity: 0 }}
    >
      {/* Delete Button (Background) */}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute inset-y-0 right-0 w-20 flex items-center justify-center text-white z-0"
        >
          <Trash2 size={20} />
        </button>
      )}

      {/* Content */}
      <motion.div
        drag={onDelete ? "x" : false}
        dragConstraints={{ left: -80, right: 0 }}
        dragElastic={0.1}
        animate={controls}
        onDragEnd={(e, { offset }) => {
          if (!onDelete || !isMounted.current) return;
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
            onClick();
          }
        }}
        className="relative flex items-center gap-4 p-4 rounded-2xl border border-stone-100 bg-stone-50 hover:bg-white hover:shadow-md hover:border-stone-200 transition-all text-left group z-10"
      >
        <div className={clsx("w-12 h-12 rounded-full flex items-center justify-center shrink-0", plan.color)}>
          <PlanIcon size={24} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-stone-900 truncate">{plan.name}</h3>
          <p className="text-xs text-stone-500 truncate">{plan.description}</p>
        </div>
        <div className="text-stone-300 group-hover:text-stone-900 transition-colors shrink-0">
          <ChevronRight size={20} />
        </div>
      </motion.div>
    </motion.div>
  );
}
