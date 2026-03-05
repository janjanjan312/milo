import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, Gender, Goal, ActivityType, ActivityIntensity, ActivityFrequency } from '../context/AppContext';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, Check, Cookie, Sandwich, Pizza, Coffee, Ban, CupSoda } from 'lucide-react';
import { translations } from '../translations';

import { StepBasicInfo, StepGoalDiet, StepCravings, StepActivity, StepCalorieTarget } from '../components/OnboardingSteps';

export default function Onboarding() {
  const { updateUser, language } = useApp();
  const t = translations[language];
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  // Local state for form
  const [formData, setFormData] = useState({
    height: 160,
    weight: 50,
    gender: 'female' as Gender,
    age: 25,
    dietPreference: 'No Restrictions',
    goals: ['fat_loss'] as Goal[],
    cravings: [] as string[],
    gutSymptoms: [] as string[],
    activityType: 'mixed' as ActivityType,
    activityIntensity: 'moderate' as ActivityIntensity,
    activityFrequency: '3-4' as ActivityFrequency,
    customCalorieTarget: undefined as number | undefined,
  });

  const TOTAL_STEPS = 5;

  const handleNext = () => {
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    } else {
      // Save and finish
      updateUser({
        height: formData.height,
        weight: formData.weight,
        gender: formData.gender,
        age: formData.age,
        dietPreference: formData.dietPreference,
        goals: formData.goals,
        cravings: formData.cravings,
        gutSymptoms: formData.gutSymptoms,
        customCalorieTarget: formData.customCalorieTarget,
        activity: {
          type: formData.activityType,
          intensity: formData.activityIntensity,
          frequency: formData.activityFrequency,
        },
        onboardingComplete: true
      });
      navigate('/chat');
    }
  };

  return (
    <div className="min-h-[100dvh] sm:min-h-full bg-stone-50 flex flex-col p-6">
      {/* Progress Bar */}
      <div className="w-full h-1 bg-stone-200 rounded-full mb-4 mt-2">
        <motion.div 
          className="h-full bg-stone-900 rounded-full"
          initial={{ width: '25%' }}
          animate={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
        />
      </div>

      <div className="flex-1 flex flex-col justify-center">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h1 className="text-3xl font-serif text-stone-900 mb-6">{t.onboarding.step1.title}</h1>
              <StepBasicInfo 
                data={formData} 
                onChange={(d) => setFormData({...formData, ...d})} 
              />
            </motion.div>
          )}
          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h1 className="text-3xl font-serif text-stone-900 mb-6">{t.onboarding.step2.title}</h1>
              <StepGoalDiet 
                data={formData} 
                onChange={(d) => setFormData({...formData, ...d})} 
              />
            </motion.div>
          )}
          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <div className="mb-6">
                <h1 className="text-3xl font-serif text-stone-900">{t.onboarding.step3.title}</h1>
                <p className="text-stone-500 mt-2">
                  {t.onboarding.step3.subtitle}
                </p>
              </div>
              <StepCravings 
                data={formData} 
                onChange={(d) => setFormData({...formData, ...d})} 
              />
            </motion.div>
          )}
          {step === 4 && (
            <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h1 className="text-3xl font-serif text-stone-900 mb-6">{t.onboarding.step4.title}</h1>
              <StepActivity 
                data={formData} 
                onChange={(d) => setFormData({...formData, ...d})} 
              />
            </motion.div>
          )}
          {step === 5 && (
            <motion.div key="step5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h1 className="text-3xl font-serif text-stone-900 mb-6">{(t.onboarding as any).step5.title}</h1>
              <StepCalorieTarget 
                data={formData} 
                onChange={(d) => setFormData({...formData, ...d})} 
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button
        onClick={handleNext}
        className="w-full bg-stone-900 text-white py-4 rounded-xl font-medium flex items-center justify-center gap-2 active:scale-95 transition-transform"
      >
        {step === TOTAL_STEPS ? t.onboarding.finish : t.onboarding.next}
        {step !== TOTAL_STEPS && <ChevronRight size={20} />}
      </button>
    </div>
  );
}

// --- Step Components removed, now using components from OnboardingSteps.tsx ---
