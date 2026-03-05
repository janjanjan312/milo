import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Save, Plus, RefreshCw, Bookmark, Zap } from 'lucide-react';
import { useApp, PlanTemplate } from '../context/AppContext';
import { v4 as uuidv4 } from 'uuid';
import { getRandomPlanColor } from '../data/mealPlans';
import clsx from 'clsx';
import { translations } from '../translations';
import { getMobilePortalTarget } from '../utils/portal';

interface SaveMealPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  templateToSave?: PlanTemplate | null;
  onSave?: (id: string) => void;
}

export default function SaveMealPlanModal({ isOpen, onClose, templateToSave, onSave }: SaveMealPlanModalProps) {
  const { dailyLogs, customMealPlans, deletedPlanIds, saveMealPlan, allPlans, language } = useApp();
  const t = translations[language];
  const [mode, setMode] = useState<'new' | 'overwrite'>('new');
  const [planName, setPlanName] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      if (allPlans.length >= 5) {
        setMode('overwrite');
      } else {
        setMode('new');
      }
      setPlanName(templateToSave?.name || `Meal Plan ${customMealPlans.length + 1}`);
      setSelectedPlanId('');
    }
  }, [isOpen, customMealPlans.length, allPlans.length, templateToSave]);

  const handleSave = () => {
    if (!templateToSave && dailyLogs.length === 0) {
      alert(t.savePlan.noLogs);
      return;
    }

    // Strict limit check: total plans (presets + custom) cannot exceed 5
    if (mode === 'new' && allPlans.length >= 5) {
      alert(t.savePlan.limitAlert);
      setMode('overwrite');
      return;
    }

    let planToSave: PlanTemplate;

    if (mode === 'new') {
      if (templateToSave) {
        planToSave = {
          ...templateToSave,
          name: planName || templateToSave.name,
          id: uuidv4(), // New ID for new plan
          isCustom: true
        };
      } else {
        if (!planName.trim()) return;
        
        planToSave = {
          id: uuidv4(),
          name: planName,
          description: `${dailyLogs.length} items • ${Math.round(dailyLogs.reduce((a, b) => a + b.calories, 0))} kcal`,
          icon: Bookmark, // Default icon for custom plans
          color: getRandomPlanColor(),
          items: dailyLogs.map(({ id, timestamp, planId, ...rest }) => rest),
          isCustom: true
        };
      }
    } else {
      // Overwrite
      const existingPlan = allPlans.find(p => p.id === selectedPlanId);
      if (!existingPlan) return;

      if (templateToSave) {
        planToSave = {
          ...templateToSave,
          id: existingPlan.id, // Keep existing ID to overwrite
          name: planName || templateToSave.name || existingPlan.name,
          isCustom: true
        };
      } else {
        planToSave = {
          ...existingPlan,
          color: getRandomPlanColor(),
          description: `${dailyLogs.length} items • ${Math.round(dailyLogs.reduce((a, b) => a + b.calories, 0))} kcal`,
          items: dailyLogs.map(({ id, timestamp, planId, ...rest }) => rest),
          // Ensure it's marked as custom if it was a preset
          isCustom: true
        };
      }
    }

    const success = saveMealPlan(planToSave);
    if (success) {
      if (onSave) onSave(planToSave.id);
      onClose();
    } else {
      alert(t.savePlan.failAlert);
    }
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
            className="absolute inset-x-0 bottom-0 z-[9999] bg-white rounded-t-3xl shadow-xl max-h-[90%] overflow-hidden flex flex-col"
          >
            <div className="absolute top-4 right-4 z-10">
              <button 
                onClick={onClose}
                className="p-2 bg-stone-100 hover:bg-stone-200 rounded-full transition-colors"
              >
                <X size={20} className="text-stone-500" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-6 pt-14 pb-4">
              {allPlans.length >= 5 && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-3 shadow-sm">
                  <div className="p-2 bg-amber-100 rounded-xl text-amber-700 shrink-0">
                    <Zap size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-amber-900 mb-0.5">{t.savePlan.limitReached} ({allPlans.length}/5)</h3>
                    <p className="text-xs text-amber-800 leading-tight">
                      {t.savePlan.limitDesc}
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-6">
                {/* Mode Selection */}
                <div className="flex p-1 bg-stone-100 rounded-xl">
                  <button
                    onClick={() => setMode('new')}
                    disabled={allPlans.length >= 5}
                    className={clsx(
                      "flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2",
                      mode === 'new' 
                        ? "bg-white text-stone-900 shadow-sm" 
                        : "text-stone-500 hover:text-stone-700",
                      allPlans.length >= 5 && mode !== 'new' && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <Plus size={16} />
                    {t.savePlan.newPlan} ({allPlans.length}/5)
                    {allPlans.length >= 5 && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full ml-1">Full</span>
                    )}
                  </button>
                  <button
                    onClick={() => setMode('overwrite')}
                    className={clsx(
                      "flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2",
                      mode === 'overwrite' 
                        ? "bg-white text-stone-900 shadow-sm" 
                        : "text-stone-500 hover:text-stone-700"
                    )}
                  >
                    <RefreshCw size={16} />
                    {t.savePlan.overwrite}
                  </button>
                </div>

                {/* Inputs */}
                {mode === 'new' ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">{t.savePlan.planName}</label>
                      <input
                        type="text"
                        value={planName}
                        onChange={(e) => setPlanName(e.target.value)}
                        placeholder={language === 'en' ? "e.g. My Keto Breakfast" : "例如：我的生酮早餐"}
                        className="w-full p-4 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900 transition-all font-medium"
                        autoFocus
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">{t.savePlan.selectToOverwrite}</label>
                    {allPlans.length > 0 ? (
                      <div className="space-y-2 p-1">
                        {allPlans.map(plan => {
                          const PlanIcon = plan.isCustom ? Bookmark : plan.icon;
                          return (
                            <button
                              key={plan.id}
                              onClick={() => setSelectedPlanId(plan.id)}
                              className={clsx(
                                "w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                                selectedPlanId === plan.id
                                  ? "border-stone-900 bg-stone-50 ring-1 ring-stone-900"
                                  : "border-stone-200 bg-white hover:border-stone-300"
                              )}
                            >
                              <div className={clsx("w-8 h-8 rounded-full flex items-center justify-center shrink-0", plan.color)}>
                                <PlanIcon size={16} />
                              </div>
                              <div className="min-w-0">
                                <div className="font-medium text-stone-900 truncate">{plan.name}</div>
                                <div className="text-xs text-stone-500 truncate">{plan.description}</div>
                              </div>
                              {selectedPlanId === plan.id && (
                                <div className="ml-auto text-stone-900">
                                  <Check size={16} />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-8 px-4 text-stone-400 text-sm">
                        <p className="mb-2">{t.savePlan.noPlans}</p>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>

            <div className="p-6 pt-4 pb-6 border-t border-stone-100 bg-white shrink-0">
              <button
                onClick={handleSave}
                disabled={mode === 'new' ? !planName.trim() : !selectedPlanId}
                className="w-full py-4 bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-medium shadow-lg shadow-stone-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={20} />
                {mode === 'new' ? t.savePlan.create : t.savePlan.update}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, getMobilePortalTarget());
}

function Check({ size, className }: { size: number, className?: string }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
