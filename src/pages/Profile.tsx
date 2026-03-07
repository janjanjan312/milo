import { useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useApp, UserProfile, WeightLog } from '../context/AppContext';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronRight, ChevronUp, ChevronDown, Lightbulb, Droplets, User as UserIcon, Target, Dumbbell, Scale, Plus, Trash2 } from 'lucide-react';
import { StepBasicInfo, StepGoalDiet, StepCravings, StepActivity, StepCalorieTarget } from '../components/OnboardingSteps';
import { translations } from '../translations';
import { getMobilePortalTarget } from '../utils/portal';

export default function Profile() {
  const { user, updateUser, savedAdvice, language, setLanguage, weightLogs, addWeightLog, removeWeightLog } = useApp();
  const t = translations[language];
  const [editSection, setEditSection] = useState<'basic' | 'goal' | 'cravings' | 'activity' | 'calorie' | 'water' | 'weight' | 'weightHistory' | null>(null);
  const [tempData, setTempData] = useState<any>(null);
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);
  const isZh = language === 'zh';
  const text = {
    basicInfo: isZh ? '基础信息' : 'Basic Info',
    diet: isZh ? '饮食偏好' : 'Diet',
    cravings: isZh ? '饮食渴望' : 'Cravings',
    activityType: isZh ? '类型' : 'Type',
    activityIntensity: isZh ? '强度' : 'Intensity',
    activityFrequency: isZh ? '频率' : 'Frequency',
    frequencySuffix: isZh ? '天/周' : 'days/week',
    none: isZh ? '无' : 'None',
    editProfile: isZh ? '编辑资料' : 'Edit Profile',
    editGoal: isZh ? '编辑目标与饮食' : 'Edit Goal & Diet',
    editCravings: isZh ? '编辑饮食渴望' : 'Edit Cravings',
    editActivity: isZh ? '编辑活动量' : 'Edit Activity',
    editCalorie: isZh ? '调整摄入目标' : 'Adjust Calorie Target',
    calorieTarget: isZh ? '每日摄入目标' : 'Daily Calorie Target',
    calorieUnit: isZh ? '千卡' : 'kcal',
    notSet: isZh ? '未设置' : 'Not set',
    saveChanges: isZh ? '保存修改' : 'Save Changes',
    waterTarget: isZh ? '每日饮水目标' : 'Daily Water Target',
    editWater: isZh ? '调整饮水目标' : 'Adjust Water Target',
    weightLog: isZh ? '体重记录' : 'Weight Log',
    addWeight: isZh ? '记录体重' : 'Log Weight',
    noWeightData: isZh ? '还没有体重记录' : 'No weight records yet',
    kg: 'kg',
  };

  const dietLabelMap: Record<string, string> = {
    'No Restrictions': t.onboarding.step2.diets.none,
    Vegetarian: t.onboarding.step2.diets.vegetarian,
    Vegan: t.onboarding.step2.diets.vegan,
    Keto: t.onboarding.step2.diets.keto,
    Paleo: t.onboarding.step2.diets.paleo,
    [t.onboarding.step2.diets.none]: t.onboarding.step2.diets.none,
    [t.onboarding.step2.diets.vegetarian]: t.onboarding.step2.diets.vegetarian,
    [t.onboarding.step2.diets.vegan]: t.onboarding.step2.diets.vegan,
    [t.onboarding.step2.diets.keto]: t.onboarding.step2.diets.keto,
    [t.onboarding.step2.diets.paleo]: t.onboarding.step2.diets.paleo,
  };

  const cravingLabelMap: Record<string, string> = {
    sweets: t.onboarding.step3.items.sweets,
    fried: t.onboarding.step3.items.fried,
    salty: t.onboarding.step3.items.salty,
    carbs: t.onboarding.step3.items.carbs,
    soda: t.onboarding.step3.items.soda,
  };

  const activityTypeLabelMap: Record<string, string> = {
    cardio: t.onboarding.step4.types.cardio,
    strength: t.onboarding.step4.types.strength,
    mixed: t.onboarding.step4.types.mixed,
    sedentary: t.onboarding.step4.types.sedentary,
  };

  const activityIntensityLabelMap: Record<string, string> = {
    low: t.onboarding.step4.intensities.low,
    moderate: t.onboarding.step4.intensities.moderate,
    high: t.onboarding.step4.intensities.high,
  };

  const cravingsText =
    user.cravings && user.cravings.length > 0
      ? user.cravings.map(c => cravingLabelMap[c] || c).join(isZh ? '、' : ', ')
      : text.none;

  if (!user) return null;

  const sortedWeightLogs = useMemo(() => {
    return [...weightLogs].sort((a, b) => b.timestamp - a.timestamp);
  }, [weightLogs]);

  const handleEdit = (section: 'basic' | 'goal' | 'cravings' | 'activity' | 'calorie' | 'water' | 'weight') => {
    setEditSection(section);
    if (section === 'weight') {
      setTempData({ newWeight: user.weight, newWeightInput: String(user.weight), newWeightNote: '' });
    } else {
      setTempData({
        ...user,
        activityType: user.activity.type,
        activityIntensity: user.activity.intensity,
        activityFrequency: user.activity.frequency,
      });
    }
  };

  const handleSave = () => {
    if (!tempData) return;

    if (editSection === 'weight') {
      const parsedWeight = typeof tempData.newWeightInput === 'string'
        ? Number(tempData.newWeightInput.replace('。', '.'))
        : Number(tempData.newWeight);
      const safeWeight = Number.isFinite(parsedWeight) ? Math.round(parsedWeight * 10) / 10 : 0;
      if (safeWeight > 0) {
        addWeightLog(safeWeight, tempData.newWeightNote || undefined);
        updateUser({ weight: safeWeight });
      }
      setEditSection(null);
      return;
    }

    const updates: Partial<UserProfile> = {
      height: tempData.height,
      weight: tempData.weight,
      gender: tempData.gender,
      age: tempData.age,
      dietPreference: tempData.dietPreference,
      goals: tempData.goals,
      gutSymptoms: tempData.gutSymptoms,
      cravings: tempData.cravings,
      customCalorieTarget: tempData.customCalorieTarget,
      waterTarget: tempData.waterTarget,
      activity: {
        type: tempData.activityType,
        intensity: tempData.activityIntensity,
        frequency: tempData.activityFrequency,
      },
    };

    updateUser(updates);
    setEditSection(null);
  };

  return (
    <div className="px-4 pt-8 space-y-4 pb-6">
      {/* User Header Card */}
      <div className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-stone-100">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center text-lg">
            👤
          </div>
          <div className="flex-1">
            <div className="font-medium text-base">User</div>
            <div className="text-stone-500 text-sm capitalize">{user.gender}, {user.age} {t.me.age}</div>
          </div>
        </div>
      </div>

      {/* AI Advice Card */}
      {savedAdvice && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb size={16} className="text-amber-500" />
            <h2 className="font-serif text-base">{isZh ? '饮食优化建议' : 'Diet Optimization'}</h2>
          </div>
          <ul className="space-y-2">
            {(() => {
              try {
                const items = JSON.parse(savedAdvice);
                if (Array.isArray(items)) return items;
                return [savedAdvice];
              } catch {
                return [savedAdvice];
              }
            })().map((item: string, idx: number) => (
              <li key={idx} className="flex gap-2 text-sm text-stone-600 leading-relaxed">
                <span className="text-amber-500 mt-0.5 shrink-0">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Basic Info Card */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100">
        <div className="flex items-center gap-2 mb-2">
          <Target size={15} className="text-stone-400" />
          <h2 className="font-serif text-base">{text.basicInfo}</h2>
        </div>
        <div className="space-y-1">
          <Row
            label={isZh ? '身高' : 'Height'}
            value={`${user.height} cm`}
            onClick={() => handleEdit('basic')}
          />
          <Row label={t.me.goal} value={
            (user.goals || []).map((g: string) => t.me.goals[g as keyof typeof t.me.goals] || g).join(isZh ? '、' : ', ') || '-'
          } onClick={() => handleEdit('goal')} />
          <Row label={text.diet} value={dietLabelMap[user.dietPreference] || user.dietPreference} onClick={() => handleEdit('goal')} />
          <Row 
            label={text.cravings}
            value={cravingsText}
            onClick={() => handleEdit('cravings')}
            multiline
          />
          <Row
            label={text.calorieTarget}
            value={user.customCalorieTarget ? `${user.customCalorieTarget} ${text.calorieUnit}` : text.notSet}
            onClick={() => handleEdit('calorie')}
          />
          <Row
            label={text.waterTarget}
            value={`${user.waterTarget || 2000} ml`}
            onClick={() => handleEdit('water')}
          />
        </div>
      </div>

      {/* Weight Log Card */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Scale size={15} className="text-stone-400" />
            <h2 className="font-serif text-base">{text.weightLog}</h2>
          </div>
          <button
            onClick={() => handleEdit('weight')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-stone-100 text-stone-600 text-xs font-medium active:bg-stone-200 transition-colors"
          >
            <Plus size={12} />
            {text.addWeight}
          </button>
        </div>
        <Row
          label={isZh ? '当前体重' : 'Current Weight'}
          value={`${user.weight} kg`}
          onClick={() => setEditSection('weightHistory')}
        />
      </div>

      {/* Activity Card */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100">
        <div className="flex items-center gap-2 mb-2">
          <Dumbbell size={15} className="text-stone-400" />
          <h2 className="font-serif text-base">{t.me.activity}</h2>
        </div>
        <div className="space-y-1">
          <Row label={text.activityType} value={activityTypeLabelMap[user.activity.type] || user.activity.type} onClick={() => handleEdit('activity')} />
          <Row label={text.activityIntensity} value={activityIntensityLabelMap[user.activity.intensity] || user.activity.intensity} onClick={() => handleEdit('activity')} />
          <Row label={text.activityFrequency} value={`${user.activity.frequency} ${text.frequencySuffix}`} onClick={() => handleEdit('activity')} />
        </div>
      </div>

      {/* Language Entry Card */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100">
        <button
          onClick={() => setIsLanguageModalOpen(true)}
          className="w-full flex items-center justify-between py-1"
        >
          <span className="text-stone-500 text-sm">{t.me.language}</span>
          <div className="flex items-center gap-2 text-stone-500">
            <span className="text-sm">{language === 'zh' ? '中文' : 'English'}</span>
            <ChevronRight size={16} className="text-stone-300" />
          </div>
        </button>
      </div>

      {/* Font Size Card */}
      <FontSizeSlider language={language} />

      {/* Edit Modal */}
      {createPortal(
        <AnimatePresence>
          {editSection && (
            <div className="absolute inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setEditSection(null)}
                className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ y: '100%' }}
                animate={{ y: 0, transition: { type: 'spring', damping: 25, stiffness: 300 } }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                className="relative w-full max-w-lg bg-stone-50 rounded-t-3xl sm:rounded-3xl shadow-xl overflow-hidden flex flex-col max-h-[90%]"
              >
                <div className="p-5 border-b border-stone-100 bg-white flex justify-between items-center">
                  <h3 className="text-lg font-serif text-stone-900 capitalize">
                    {editSection === 'basic'
                      ? text.editProfile
                      : editSection === 'goal'
                        ? text.editGoal
                        : editSection === 'cravings'
                          ? text.editCravings
                          : editSection === 'calorie'
                            ? text.editCalorie
                            : editSection === 'water'
                              ? text.editWater
                              : editSection === 'weight'
                                ? text.addWeight
                                : editSection === 'weightHistory'
                                  ? text.weightLog
                                  : text.editActivity}
                  </h3>
                  <button onClick={() => setEditSection(null)} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
                    <X size={20} />
                  </button>
                </div>

                <div className="p-5 overflow-y-auto flex-1">
                  {editSection === 'basic' && <StepBasicInfo data={tempData} onChange={(d: any) => setTempData({...tempData, ...d})} />}
                  {editSection === 'goal' && <StepGoalDiet data={tempData} onChange={(d: any) => setTempData({...tempData, ...d})} />}
                  {editSection === 'cravings' && <StepCravings data={tempData} onChange={(d: any) => setTempData({...tempData, ...d})} />}
                  {editSection === 'activity' && <StepActivity data={tempData} onChange={(d: any) => setTempData({...tempData, ...d})} />}
                  {editSection === 'calorie' && <StepCalorieTarget data={tempData} onChange={(d: any) => setTempData({...tempData, ...d})} />}
                  {editSection === 'water' && (
                    <WaterTargetEditor
                      value={tempData?.waterTarget || 2000}
                      onChange={(val: number) => setTempData({...tempData, waterTarget: val})}
                      language={language}
                    />
                  )}
                  {editSection === 'weight' && (
                    <WeightEditor
                      data={tempData}
                      onChange={(d: any) => setTempData({...tempData, ...d})}
                      language={language}
                    />
                  )}
                  {editSection === 'weightHistory' && (
                    <WeightTimeline
                      logs={sortedWeightLogs}
                      onDelete={removeWeightLog}
                      emptyText={text.noWeightData}
                      language={language}
                    />
                  )}
                </div>

                {editSection !== 'weightHistory' && (
                  <div className="p-5 bg-white border-t border-stone-100">
                    <button 
                      onClick={handleSave}
                      className="w-full bg-stone-900 text-white py-4 rounded-xl font-medium active:scale-95 transition-transform"
                    >
                      {text.saveChanges}
                    </button>
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        getMobilePortalTarget()
      )}

      {/* Language Modal */}
      {createPortal(
        <AnimatePresence>
          {isLanguageModalOpen && (
            <div className="absolute inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4">
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setIsLanguageModalOpen(false)}
                className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
              />
              <motion.div
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-xl overflow-hidden"
              >
                <div className="p-5 border-b border-stone-100 flex items-center justify-between">
                  <h3 className="text-lg font-serif text-stone-900">{t.me.language}</h3>
                  <button onClick={() => setIsLanguageModalOpen(false)} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
                    <X size={20} />
                  </button>
                </div>
                <div className="p-5 space-y-2">
                  <button
                    onClick={() => { setLanguage('en'); setIsLanguageModalOpen(false); }}
                    className={`w-full py-3 rounded-xl border text-sm font-medium transition-all ${
                      language === 'en'
                        ? 'border-stone-900 bg-stone-900 text-white'
                        : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
                    }`}
                  >
                    English
                  </button>
                  <button
                    onClick={() => { setLanguage('zh'); setIsLanguageModalOpen(false); }}
                    className={`w-full py-3 rounded-xl border text-sm font-medium transition-all ${
                      language === 'zh'
                        ? 'border-stone-900 bg-stone-900 text-white'
                        : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
                    }`}
                  >
                    中文
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        getMobilePortalTarget()
      )}
    </div>
  );
}

function WaterTargetEditor({ value, onChange, language }: { value: number; onChange: (v: number) => void; language: 'en' | 'zh' }) {
  const presets = [1500, 2000, 2500, 3000];
  const isZh = language === 'zh';
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm text-stone-500 mb-3">{isZh ? '选择目标' : 'Select Target'}</label>
        <div className="grid grid-cols-2 gap-2">
          {presets.map(ml => (
            <button
              key={ml}
              onClick={() => onChange(ml)}
              className={`py-3 rounded-xl border text-sm font-medium transition-all ${
                value === ml
                  ? 'border-stone-900 bg-stone-900 text-white'
                  : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
              }`}
            >
              {ml} ml
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm text-stone-500 mb-2">{isZh ? '或自定义' : 'Or custom'}</label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={500}
            max={4000}
            step={100}
            value={value}
            onChange={e => onChange(parseInt(e.target.value))}
            className="flex-1 accent-stone-900"
          />
          <span className="text-sm font-mono font-medium text-stone-900 w-16 text-right">{value} ml</span>
        </div>
      </div>
      <p className="text-xs text-stone-400">{isZh ? '一般建议每天饮水 1500-2500ml，运动量大可适当增加。' : 'Generally 1500-2500ml per day is recommended. Increase if highly active.'}</p>
    </div>
  );
}

function WeightEditor({ data, onChange, language }: { data: any; onChange: (d: any) => void; language: 'en' | 'zh' }) {
  const isZh = language === 'zh';
  const inputValue = data.newWeightInput ?? (data.newWeight ? String(data.newWeight) : '');
  const clampAndRound = (v: number) => Math.min(300, Math.max(20, Math.round(v * 10) / 10));
  const applyWeight = (v: number) => {
    const next = clampAndRound(v);
    onChange({ newWeightInput: String(next), newWeight: next });
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm text-stone-500 mb-2">{isZh ? '当前体重 (kg)' : 'Current Weight (kg)'}</label>
        <input
          type="text"
          inputMode="decimal"
          value={inputValue}
          onChange={e => {
            const raw = e.target.value.replace('。', '.');
            if (raw === '' || /^\d{0,3}(\.\d{0,1})?$/.test(raw)) {
              const parsed = Number(raw);
              onChange({
                newWeightInput: raw,
                newWeight: Number.isFinite(parsed) ? parsed : 0,
              });
            }
          }}
          className="w-full px-4 py-3 rounded-xl border border-stone-200 text-stone-900 text-lg font-medium focus:outline-none focus:border-stone-400 transition-colors"
          placeholder={isZh ? '输入体重，如 50.5' : 'Enter weight, e.g. 50.5'}
        />
      </div>
      <div>
        <label className="block text-sm text-stone-500 mb-2">{isZh ? '备注（可选）' : 'Note (optional)'}</label>
        <input
          type="text"
          value={data.newWeightNote || ''}
          onChange={e => onChange({ newWeightNote: e.target.value })}
          className="w-full px-4 py-3 rounded-xl border border-stone-200 text-stone-900 text-sm focus:outline-none focus:border-stone-400 transition-colors"
          placeholder={isZh ? '如：早晨空腹' : 'e.g. Morning, fasting'}
        />
      </div>
    </div>
  );
}

function WeightTimeline({ logs, onDelete, emptyText, language }: {
  logs: WeightLog[];
  onDelete: (id: string) => void;
  emptyText: string;
  language: 'en' | 'zh';
}) {
  const isZh = language === 'zh';

  if (logs.length === 0) {
    return (
      <p className="text-sm text-stone-400 text-center py-4">{emptyText}</p>
    );
  }

  const chartLogs = [...logs].reverse().slice(-10);
  const weights = chartLogs.map(l => l.weight);
  const minW = Math.min(...weights) - 0.5;
  const maxW = Math.max(...weights) + 0.5;
  const range = maxW - minW || 1;

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    if (isZh) {
      return `${d.getMonth() + 1}/${d.getDate()}`;
    }
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const formatFullDate = (ts: number) => {
    const d = new Date(ts);
    if (isZh) {
      return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const svgWidth = 280;
  const svgHeight = 80;
  const padX = 4;
  const padY = 8;
  const plotW = svgWidth - padX * 2;
  const plotH = svgHeight - padY * 2;

  const points = chartLogs.map((l, i) => ({
    x: padX + (chartLogs.length > 1 ? (i / (chartLogs.length - 1)) * plotW : plotW / 2),
    y: padY + plotH - ((l.weight - minW) / range) * plotH,
    weight: l.weight,
    date: formatDate(l.timestamp),
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = linePath + ` L ${points[points.length - 1].x} ${svgHeight - padY} L ${points[0].x} ${svgHeight - padY} Z`;

  return (
    <div className="space-y-3">
      {chartLogs.length >= 2 && (
        <div className="bg-stone-50 rounded-xl p-3">
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-20">
            <defs>
              <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#78716c" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#78716c" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#weightGrad)" />
            <path d={linePath} fill="none" stroke="#78716c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r="3" fill="#fff" stroke="#78716c" strokeWidth="1.5" />
            ))}
            {points.length > 0 && (
              <text x={points[points.length - 1].x} y={points[points.length - 1].y - 8} textAnchor="middle" fontSize="10" fill="#44403c" fontWeight="500">
                {points[points.length - 1].weight}
              </text>
            )}
            {points.length >= 2 && (
              <text x={points[0].x} y={points[0].y - 8} textAnchor="middle" fontSize="10" fill="#a8a29e" fontWeight="400">
                {points[0].weight}
              </text>
            )}
          </svg>
          <div className="flex justify-between px-1 mt-1">
            <span className="text-[10px] text-stone-400">{points[0]?.date}</span>
            <span className="text-[10px] text-stone-400">{points[points.length - 1]?.date}</span>
          </div>
        </div>
      )}

      <div className="space-y-0">
        {(() => {
          const recent = logs.slice(0, 10);
          const firstLog = logs[logs.length - 1];
          const showFirst = logs.length > 10 && !recent.includes(firstLog);
          const displayLogs = showFirst ? [...recent, firstLog] : recent;

          return displayLogs.map((log, idx) => {
            const isGap = showFirst && idx === recent.length;
            const prevInDisplay = idx < displayLogs.length - 1 ? displayLogs[idx + 1] : null;
            const diff = prevInDisplay && !isGap ? log.weight - prevInDisplay.weight : null;
            return (
              <div key={log.id}>
                {isGap && (
                  <div className="flex items-center gap-2 py-2 px-1">
                    <div className="flex-1 border-t border-dashed border-stone-200" />
                    <span className="text-[10px] text-stone-400">{isZh ? '初始记录' : 'Initial'}</span>
                    <div className="flex-1 border-t border-dashed border-stone-200" />
                  </div>
                )}
                <div className="flex items-center justify-between py-2.5 border-b border-stone-100 last:border-0 px-1">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium text-stone-900 text-sm">{log.weight} kg</span>
                      {diff !== null && diff !== 0 && (
                        <span className={`text-xs font-medium ${diff < 0 ? 'text-emerald-500' : 'text-rose-400'}`}>
                          {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-stone-400">{formatFullDate(log.timestamp)}</span>
                      {log.note && <span className="text-xs text-stone-400">· {log.note}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => onDelete(log.id)}
                    className="p-1.5 text-stone-300 hover:text-rose-400 transition-colors shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  onClick,
  multiline = false,
}: {
  label: string,
  value: string,
  onClick: () => void,
  multiline?: boolean,
}) {
  if (multiline) {
    return (
      <button
        onClick={onClick}
        className="w-full py-2.5 border-b border-stone-100 last:border-0 active:bg-stone-50 transition-colors rounded-lg px-2 -mx-2"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="text-stone-500 text-sm">{label}</span>
          <div className="flex items-start gap-2 max-w-[62%] ml-auto">
            <span className="font-medium text-stone-900 text-sm leading-snug break-words text-right flex-1">
              {value}
            </span>
            <ChevronRight size={16} className="text-stone-300 mt-0.5 shrink-0" />
          </div>
        </div>
      </button>
    );
  }

  return (
    <button 
      onClick={onClick}
      className="w-full flex justify-between items-center py-2.5 border-b border-stone-100 last:border-0 active:bg-stone-50 transition-colors rounded-lg px-2 -mx-2"
    >
      <span className="text-stone-500 text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-medium text-stone-900 text-sm">{value}</span>
        <ChevronRight size={16} className="text-stone-300" />
      </div>
    </button>
  );
}

function FontSizeSlider({ language }: { language: 'en' | 'zh' }) {
  const isZh = language === 'zh';
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const defaultSize = isStandalone ? 18 : 16;
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('app_font_size');
    return saved ? Number(saved) : defaultSize;
  });

  const handleChange = useCallback((value: number) => {
    setFontSize(value);
    localStorage.setItem('app_font_size', String(value));
    document.documentElement.style.fontSize = `${value}px`;
  }, []);

  const handleReset = useCallback(() => {
    handleChange(defaultSize);
  }, [defaultSize, handleChange]);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100">
      <div className="flex items-center justify-between mb-3">
        <span className="text-stone-500 text-sm">{isZh ? '字体大小' : 'Font Size'}</span>
        <button
          onClick={handleReset}
          className="text-xs text-stone-400 hover:text-stone-600 transition-colors"
        >
          {isZh ? '恢复默认' : 'Reset'}
        </button>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-stone-400 shrink-0">A</span>
        <input
          type="range"
          min={14}
          max={22}
          step={1}
          value={fontSize}
          onChange={e => handleChange(Number(e.target.value))}
          className="flex-1 accent-stone-900"
        />
        <span className="text-lg text-stone-400 shrink-0">A</span>
      </div>
      <div className="text-center mt-2">
        <span className="text-xs text-stone-400">{fontSize}px</span>
      </div>
    </div>
  );
}
