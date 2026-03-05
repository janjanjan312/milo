import { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Cookie, Sandwich, Pizza, Coffee, Ban, CupSoda } from 'lucide-react';
import { Gender, Goal, ActivityType, ActivityIntensity, ActivityFrequency, useApp } from '../context/AppContext';
import type { GutSymptom } from '../context/AppContext';
import { translations } from '../translations';

interface StepProps {
  data: any;
  onChange: (d: any) => void;
}

export function StepBasicInfo({ data, onChange }: StepProps) {
  const { language } = useApp();
  const t = translations[language];

  const handleGenderChange = (newGender: string) => {
    let newHeight = data.height;
    let newWeight = data.weight;

    if (newGender === 'female') {
      newHeight = 160;
      newWeight = 50;
    } else if (newGender === 'male') {
      newHeight = 175;
      newWeight = 70;
    } else {
      newHeight = 170;
      newWeight = 60;
    }

    onChange({ gender: newGender, height: newHeight, weight: newWeight });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-stone-500 mb-1">{t.onboarding.step1.gender}</label>
          <div className="flex gap-2">
            {['female', 'male', 'other'].map(g => (
              <button
                key={g}
                onClick={() => handleGenderChange(g)}
                className={`flex-1 py-3 rounded-lg border capitalize ${
                  data.gender === g ? 'border-stone-900 bg-stone-50 text-stone-900' : 'border-stone-200 bg-white'
                }`}
              >
                {t.onboarding.step1.genders[g as keyof typeof t.onboarding.step1.genders]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-stone-500 mb-1">{t.onboarding.step1.height} (cm)</label>
            <select 
              value={data.height} 
              onChange={(e) => onChange({ height: Number(e.target.value) })}
              className="w-full p-3 bg-white border border-stone-200 rounded-lg"
            >
              {Array.from({ length: 100 }, (_, i) => 120 + i).map(h => (
                <option key={h} value={h}>{h} cm</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-500 mb-1">{t.onboarding.step1.weight} (kg)</label>
            <select 
              value={data.weight} 
              onChange={(e) => onChange({ weight: Number(e.target.value) })}
              className="w-full p-3 bg-white border border-stone-200 rounded-lg"
            >
              {Array.from({ length: 150 }, (_, i) => 30 + i).map(w => (
                <option key={w} value={w}>{w} kg</option>
              ))}
            </select>
          </div>
        </div>

        <div>
           <label className="block text-sm font-medium text-stone-500 mb-1">{t.onboarding.step1.age}</label>
           <select 
              value={data.age} 
              onChange={(e) => onChange({ age: Number(e.target.value) })}
              className="w-full p-3 bg-white border border-stone-200 rounded-lg"
            >
              {Array.from({ length: 80 }, (_, i) => 12 + i).map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
        </div>
      </div>
    </div>
  );
}

export function StepGoalDiet({ data, onChange }: StepProps) {
  const { language } = useApp();
  const t = translations[language];

  const goals = [
    { id: 'fat_loss', label: t.onboarding.step2.goals.fat_loss.label, desc: t.onboarding.step2.goals.fat_loss.desc },
    { id: 'muscle_gain', label: t.onboarding.step2.goals.muscle_gain.label, desc: t.onboarding.step2.goals.muscle_gain.desc },
    { id: 'gut_health', label: t.onboarding.step2.goals.gut_health.label, desc: t.onboarding.step2.goals.gut_health.desc },
  ];

  const gutSymptomsList: { id: GutSymptom; label: string }[] = [
    { id: 'bloating', label: (t.onboarding.step2 as any).gutSymptoms.items.bloating },
    { id: 'constipation', label: (t.onboarding.step2 as any).gutSymptoms.items.constipation },
    { id: 'loose_stools', label: (t.onboarding.step2 as any).gutSymptoms.items.loose_stools },
    { id: 'acid_reflux', label: (t.onboarding.step2 as any).gutSymptoms.items.acid_reflux },
    { id: 'cramps', label: (t.onboarding.step2 as any).gutSymptoms.items.cramps },
    { id: 'food_intolerance', label: (t.onboarding.step2 as any).gutSymptoms.items.food_intolerance },
  ];

  const toggleGutSymptom = (id: GutSymptom) => {
    const current: string[] = data.gutSymptoms || [];
    if (current.includes(id)) {
      onChange({ gutSymptoms: current.filter((s: string) => s !== id) });
    } else {
      onChange({ gutSymptoms: [...current, id] });
    }
  };

  const diets = [
    { id: 'No Restrictions', label: t.onboarding.step2.diets.none },
    { id: 'Vegetarian', label: t.onboarding.step2.diets.vegetarian },
    { id: 'Vegan', label: t.onboarding.step2.diets.vegan },
    { id: 'Keto', label: t.onboarding.step2.diets.keto },
    { id: 'Paleo', label: t.onboarding.step2.diets.paleo },
  ];

  const gutSymptomsT = (t.onboarding.step2 as any).gutSymptoms;

  const selectedGoals: string[] = data.goals || [];
  const exclusive = ['fat_loss', 'muscle_gain'];
  const toggleGoal = (id: string) => {
    const isSelected = selectedGoals.includes(id);
    let next: string[];
    if (isSelected) {
      next = selectedGoals.filter((g: string) => g !== id);
      if (next.length === 0) return;
    } else {
      next = exclusive.includes(id)
        ? [...selectedGoals.filter((g: string) => !exclusive.includes(g) || g === id), id]
        : [...selectedGoals, id];
    }
    const cleared = id === 'gut_health' && isSelected ? { gutSymptoms: [] } : {};
    onChange({ goals: next, ...cleared });
  };

  const hasGutGoal = selectedGoals.includes('gut_health');

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {goals.map(goal => {
          const isSelected = selectedGoals.includes(goal.id);
          return (
            <div key={goal.id}>
              <button
                onClick={() => toggleGoal(goal.id)}
                className={`w-full p-4 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'border-stone-900 bg-stone-50 ring-1 ring-stone-900' 
                    : 'border-stone-200 bg-white hover:border-stone-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-stone-900">{goal.label}</div>
                    <div className="text-sm text-stone-500">{goal.desc}</div>
                  </div>
                  {isSelected && <Check size={18} className="text-stone-900 shrink-0 ml-3" />}
                </div>
              </button>

              <AnimatePresence>
                {goal.id === 'gut_health' && hasGutGoal && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 ml-2 pl-4 border-l-2 border-stone-200 space-y-2">
                      <p className="text-sm text-stone-500">{gutSymptomsT.subtitle}</p>
                      <div className="flex flex-wrap gap-2">
                        {gutSymptomsList.map(s => {
                          const selected = (data.gutSymptoms || []).includes(s.id);
                          return (
                            <button
                              key={s.id}
                              onClick={() => toggleGutSymptom(s.id)}
                              className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                                selected
                                  ? 'bg-stone-900 text-white border-stone-900'
                                  : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
                              }`}
                            >
                              {s.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-500 mb-2">{t.onboarding.step2.diet}</label>
        <div className="flex flex-wrap gap-2">
          {diets.map(diet => (
            <button
              key={diet.id}
              onClick={() => onChange({ dietPreference: diet.id })}
              className={`px-4 py-2 rounded-full text-sm border ${
                data.dietPreference === diet.id
                  ? 'bg-stone-900 text-white border-stone-900'
                  : 'bg-white text-stone-600 border-stone-200'
              }`}
            >
              {diet.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function StepCravings({ data, onChange }: StepProps) {
  const { language } = useApp();
  const t = translations[language];

  const cravingsList = [
    { id: 'sweets', label: t.onboarding.step3.items.sweets, icon: Cookie },
    { id: 'fried', label: t.onboarding.step3.items.fried, icon: Pizza },
    { id: 'salty', label: t.onboarding.step3.items.salty, icon: Sandwich },
    { id: 'carbs', label: t.onboarding.step3.items.carbs, icon: Coffee },
    { id: 'soda', label: t.onboarding.step3.items.soda, icon: CupSoda },
  ];

  const toggleCraving = (id: string) => {
    const current = data.cravings || [];
    if (current.includes(id)) {
      onChange({ cravings: current.filter((c: string) => c !== id) });
    } else {
      onChange({ cravings: [...current, id] });
    }
  };

  const setNone = () => {
    onChange({ cravings: [] });
  };

  const hasCravings = data.cravings && data.cravings.length > 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        {cravingsList.map(item => {
          const isSelected = data.cravings?.includes(item.id);
          return (
            <button
              key={item.id}
              onClick={() => toggleCraving(item.id)}
              className={`p-3 rounded-xl border text-left transition-all flex items-center gap-3 ${
                isSelected
                  ? 'border-stone-900 bg-stone-50 ring-1 ring-stone-900' 
                  : 'border-stone-200 bg-white hover:border-stone-300'
              }`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                isSelected ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-500'
              }`}>
                <item.icon size={20} />
              </div>
              <div className="text-stone-900 leading-tight">{item.label}</div>
            </button>
          );
        })}

        <button
          onClick={setNone}
          className={`col-span-2 p-3 rounded-xl border text-left transition-all flex items-center gap-3 ${
            !hasCravings
              ? 'border-stone-900 bg-stone-50 ring-1 ring-stone-900' 
              : 'border-stone-200 bg-white hover:border-stone-300'
          }`}
        >
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
            !hasCravings ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-500'
          }`}>
            <Ban size={20} />
          </div>
          <div className="text-stone-900">{t.onboarding.step3.items.none}</div>
          {!hasCravings && <Check size={20} className="ml-auto text-stone-900" />}
        </button>
      </div>
    </div>
  );
}

export function StepActivity({ data, onChange }: StepProps) {
  const { language } = useApp();
  const t = translations[language];

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-stone-500 mb-2">{t.onboarding.step4.type}</label>
          <div className="grid grid-cols-2 gap-2">
            {['cardio', 'strength', 'mixed', 'sedentary'].map(type => (
              <button
                key={type}
                onClick={() => onChange({ activityType: type })}
                className={`p-3 rounded-lg border capitalize text-sm ${
                  data.activityType === type ? 'border-stone-900 bg-stone-50 text-stone-900' : 'border-stone-200 bg-white'
                }`}
              >
                {t.onboarding.step4.types[type as keyof typeof t.onboarding.step4.types]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-500 mb-2">{t.onboarding.step4.intensity}</label>
          <div className="flex gap-2">
            {['low', 'moderate', 'high'].map(intensity => (
              <button
                key={intensity}
                onClick={() => onChange({ activityIntensity: intensity })}
                className={`flex-1 p-3 rounded-lg border capitalize text-sm ${
                  data.activityIntensity === intensity ? 'border-stone-900 bg-stone-50 text-stone-900' : 'border-stone-200 bg-white'
                }`}
              >
                {t.onboarding.step4.intensities[intensity as keyof typeof t.onboarding.step4.intensities]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-500 mb-2">{t.onboarding.step4.frequency}</label>
          <div className="flex gap-2">
            {['1-2', '3-4', '5+'].map(f => (
              <button
                key={f}
                onClick={() => onChange({ activityFrequency: f })}
                className={`flex-1 p-3 rounded-lg border text-sm ${
                  data.activityFrequency === f ? 'border-stone-900 bg-stone-50 text-stone-900' : 'border-stone-200 bg-white'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function computeTDEE(data: any): number {
  const weight = Math.max(35, Number(data.weight) || 65);
  const height = Math.max(140, Number(data.height) || 170);
  const age = Math.max(16, Number(data.age) || 25);
  const gender = String(data.gender || 'other');
  const activityType = String(data.activityType || 'mixed');
  const activityIntensity = String(data.activityIntensity || 'moderate');
  const activityFrequency = String(data.activityFrequency || '3-4');

  const genderOffset = gender === 'male' ? 5 : gender === 'female' ? -161 : -78;
  const bmr = 10 * weight + 6.25 * height - 5 * age + genderOffset;

  const intensityMap: Record<string, number> = { low: 1.35, moderate: 1.5, high: 1.7 };
  const freqAdjust: Record<string, number> = { '1-2': -0.05, '3-4': 0, '5+': 0.08 };

  let factor = intensityMap[activityIntensity] ?? 1.5;
  if (activityType === 'sedentary') factor = 1.2;
  factor += freqAdjust[activityFrequency] ?? 0;
  factor = Math.min(1.9, Math.max(1.2, factor));

  return Math.round(bmr * factor);
}

export function StepCalorieTarget({ data, onChange }: StepProps) {
  const { language } = useApp();
  const t5 = (translations[language].onboarding as any).step5;

  const tdee = useMemo(() => computeTDEE(data), [
    data.weight, data.height, data.age, data.gender,
    data.activityType, data.activityIntensity, data.activityFrequency,
  ]);

  // ±10% error margin for Mifflin-St Jeor estimates
  const tdeeLow = Math.round(tdee * 0.9 / 50) * 50;
  const tdeeHigh = Math.round(tdee * 1.1 / 50) * 50;

  const hasFatLoss = Array.isArray(data.goals) && data.goals.includes('fat_loss');
  const hasMuscleGain = Array.isArray(data.goals) && data.goals.includes('muscle_gain');
  const minCalories = data.gender === 'female' ? 1200 : 1400;
  const surplus = Math.round(tdee * 0.15 / 50) * 50;

  const lowerBound = hasFatLoss
    ? Math.max(minCalories, Math.round((tdeeLow - 500) / 50) * 50)
    : Math.max(minCalories, Math.round(tdeeLow / 50) * 50);
  const upperBound = hasMuscleGain
    ? Math.round(tdeeHigh * 1.3 / 50) * 50
    : hasFatLoss
      ? Math.round(tdeeHigh / 50) * 50
      : Math.round(tdeeHigh * 1.1 / 50) * 50;
  const defaultTarget = hasFatLoss
    ? Math.max(lowerBound, Math.round((tdee - 400) / 50) * 50)
    : hasMuscleGain
      ? Math.round((tdee + surplus) / 50) * 50
      : Math.round(tdee / 50) * 50;

  const weight = data.weight || 60;
  const proteinLow = Math.round(weight * 1.6);
  const proteinHigh = Math.round(weight * 2.2);

  const currentTarget = data.customCalorieTarget ?? defaultTarget;

  const handleChange = (val: number) => {
    const clamped = Math.min(upperBound, Math.max(lowerBound, Math.round(val / 50) * 50));
    onChange({ customCalorieTarget: clamped });
  };

  const deficit = tdee - currentTarget;

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-stone-500">{t5.tdeeLabel}</span>
          <span className="text-lg font-bold text-stone-900">{tdeeLow} ~ {tdeeHigh} <span className="text-xs font-normal text-stone-400">kcal</span></span>
        </div>

        <div className="h-px bg-stone-100" />

        {hasFatLoss && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm text-stone-500">{t5.deficitLabel}</span>
              <span className="text-sm font-medium text-stone-700">{t5.deficitValue}</span>
            </div>
            <div className="h-px bg-stone-100" />
          </>
        )}

        {hasMuscleGain && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm text-stone-500">{t5.surplusLabel}</span>
              <span className="text-sm font-medium text-stone-700">{t5.surplusDesc}</span>
            </div>
            <div className="h-px bg-stone-100" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-stone-500">{t5.proteinLabel}</span>
              <span className="text-sm font-medium text-stone-700">{proteinLow} ~ {proteinHigh} {t5.proteinUnit}</span>
            </div>
            <div className="h-px bg-stone-100" />
          </>
        )}

        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-stone-500">{t5.targetLabel}</span>
            <span className="text-2xl font-bold text-stone-900">{currentTarget} <span className="text-sm font-normal text-stone-400">{t5.targetUnit}</span></span>
          </div>

          <input
            type="range"
            min={lowerBound}
            max={upperBound}
            step={50}
            value={currentTarget}
            onChange={(e) => handleChange(Number(e.target.value))}
            className="w-full h-2 bg-stone-200 rounded-full appearance-none cursor-pointer accent-stone-900"
          />

          <div className="flex justify-between text-xs text-stone-400 mt-1">
            <span>{lowerBound}</span>
            <span className="text-stone-500">
              {hasFatLoss
                ? (language === 'zh' ? `缺口 ${deficit} 千卡` : `deficit ${deficit} kcal`)
                : hasMuscleGain
                  ? (language === 'zh' ? `盈余 ${Math.round(-deficit / tdee * 100)}%` : `surplus ${Math.round(-deficit / tdee * 100)}%`)
                  : (language === 'zh' ? `≈ TDEE` : `≈ TDEE`)}
            </span>
            <span>{upperBound}</span>
          </div>
        </div>
      </div>

      <p className="text-xs text-stone-400 text-center">
        {hasMuscleGain ? t5.hintMuscle : hasFatLoss ? t5.hint : t5.hintGeneral}
      </p>
    </div>
  );
}
