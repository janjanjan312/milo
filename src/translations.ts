export const translations = {
  en: {
    nav: {
      record: 'Record',
      plan: 'Plan',
      chat: 'Chat',
      me: 'Me'
    },
    me: {
      title: 'Me',
      profile: 'Profile',
      settings: 'Settings',
      language: 'Language',
      stats: 'Stats',
      height: 'Height',
      weight: 'Weight',
      age: 'Age',
      goal: 'Goal',
      activity: 'Activity',
      sync: 'Sync Health Data',
      syncing: 'Syncing...',
      synced: 'Synced',
      goals: {
        fat_loss: 'Fat Loss',
        muscle_gain: 'Muscle Gain',
        gut_health: 'Gut Health'
      }
    },
    record: {
      title: 'Daily Record',
      calories: 'Calories',
      protein: 'Protein',
      carbs: 'Carbs',
      fat: 'Fat',
      veggie: 'Veggie',
      target: 'Target',
      remaining: 'Remaining',
      over: 'Over',
      meals: {
        breakfast: 'Breakfast',
        lunch: 'Lunch',
        dinner: 'Dinner',
        snack: 'Snack'
      },
      addFood: 'Add Food',
      noLogs: 'No logs for today yet.',
      water: {
        label: 'Water',
        unit: 'ml',
        add250: '+250ml',
        add500: '+500ml',
        logged: 'Logged',
        target: 'Daily Water Target',
      }
    },
    plan: {
      title: 'Meal Plan',
      optimized: 'AI Optimized',
      generate: 'Generate New Plan',
      apply: 'Apply to Today',
      applied: 'Applied to Today',
      serving: 'serving',
      unit: 'unit'
    },
    chat: {
      title: 'AI Nutritionist',
      placeholder: 'Ask about your diet...',
      send: 'Send'
    },
    onboarding: {
      step1: {
        title: "Let's estimate your BMR",
        gender: 'Gender',
        age: 'Age',
        height: 'Height',
        weight: 'Weight',
        genders: {
          male: 'Male',
          female: 'Female',
          other: 'Other'
        }
      },
      step2: {
        title: "What's your goal?",
        diet: 'Dietary Preference',
        goals: {
          fat_loss: { label: 'Fat Loss', desc: 'Burn fat & get lean' },
          muscle_gain: { label: 'Muscle Gain', desc: 'Build strength & mass' },
          gut_health: { label: 'Gut Health', desc: 'Improve digestion & gut balance' }
        },
        gutSymptoms: {
          title: 'What symptoms do you experience?',
          subtitle: 'Select all that apply — this helps us recommend gut-friendly foods.',
          items: {
            bloating: 'Bloating / Gas',
            constipation: 'Constipation',
            loose_stools: 'Loose stools / Diarrhea',
            acid_reflux: 'Acid reflux / Heartburn',
            cramps: 'Abdominal cramps',
            food_intolerance: 'Food intolerance (dairy, gluten, etc.)'
          }
        },
        diets: {
          none: 'No Restrictions',
          vegetarian: 'Vegetarian',
          vegan: 'Vegan',
          keto: 'Keto',
          paleo: 'Paleo'
        }
      },
      step3: {
        title: "Any cravings?",
        subtitle: "This helps us understand your body's needs—often a sign to adjust macros.",
        items: {
          sweets: 'Sweets',
          fried: 'Fried Food',
          salty: 'Salty Snacks',
          carbs: 'Carbs',
          soda: 'Soda',
          none: 'None / I eat clean'
        }
      },
      step4: {
        title: "Activity Level",
        type: 'Primary Activity Type',
        intensity: 'Intensity',
        frequency: 'Frequency (days/week)',
        types: {
          cardio: 'Cardio',
          strength: 'Strength',
          mixed: 'Mixed',
          sedentary: 'Sedentary'
        },
        intensities: {
          low: 'Low',
          moderate: 'Moderate',
          high: 'High'
        }
      },
      step5: {
        title: 'Set Your Daily Calorie Target',
        tdeeLabel: 'Estimated Daily Expenditure',
        deficitLabel: 'Recommended Deficit',
        deficitValue: '300 ~ 500 kcal',
        surplusLabel: 'Recommended Surplus',
        surplusDesc: '10-20% above TDEE for muscle synthesis',
        proteinLabel: 'Protein Recommendation',
        proteinUnit: 'g/day',
        targetLabel: 'Daily Intake Target',
        targetUnit: 'kcal',
        hint: 'You can adjust this later in your profile.',
        hintMuscle: 'Add 10-20% calories above TDEE and pair with resistance training for lean muscle growth.',
        hintGeneral: 'Based on your body stats and activity level, this is your estimated maintenance intake.',
        minWarning: 'Cannot go below the safe minimum',
      },
      next: 'Next',
      finish: 'Start Journey'
    },
    addFood: {
      edit: 'Edit Food',
      add: 'Add Food',
      camera: 'Camera',
      upload: 'Upload',
      analyzing: 'Analyzing food image...',
      name: 'Food Name',
      amount: 'Amount',
      unit: 'Unit',
      estimate: 'Auto-Calculated Estimate',
      update: 'Update',
      units: {
        g: 'grams (g)',
        ml: 'milliliters (ml)',
        oz: 'ounces (oz)',
        cup: 'cups',
        pcs: 'pieces'
      }
    },
    mealPlans: {
      title: 'Meal Plans',
      back: 'Back to list',
      replace: 'Replace',
      addToToday: 'Add to Today',
      replaceConfirm: 'Replace existing log'
    },
    savePlan: {
      title: 'Save Meal Plan',
      limitReached: 'Limit Reached',
      limitDesc: 'Max 5 plans. Select one below to overwrite.',
      newPlan: 'New Plan',
      overwrite: 'Overwrite',
      planName: 'Plan Name',
      selectToOverwrite: 'Select Plan to Overwrite',
      create: 'Create Plan',
      update: 'Update Plan',
      noPlans: 'No plans available.',
      noLogs: 'No food logs to save!',
      limitAlert: 'Limit reached: You can only have 5 meal plans in total. Please overwrite an existing plan.',
      failAlert: 'Failed to save meal plan. You may have reached the limit.'
    }
  },
  zh: {
    nav: {
      record: '记录',
      plan: '方案',
      chat: '对话',
      me: '我的'
    },
    me: {
      title: '个人中心',
      profile: '个人资料',
      settings: '设置',
      language: '语言切换',
      stats: '数据',
      height: '身高',
      weight: '体重',
      age: '年龄',
      goal: '目标',
      activity: '活动量',
      sync: '同步健康数据',
      syncing: '同步中...',
      synced: '已同步',
      goals: {
        fat_loss: '减脂',
        muscle_gain: '增肌',
        gut_health: '改善肠道'
      }
    },
    record: {
      title: '每日记录',
      calories: '热量',
      protein: '蛋白质',
      carbs: '碳水',
      fat: '脂肪',
      veggie: '蔬菜',
      target: '目标',
      remaining: '剩余',
      over: '超出',
      meals: {
        breakfast: '早餐',
        lunch: '午餐',
        dinner: '晚餐',
        snack: '加餐'
      },
      addFood: '添加食物',
      noLogs: '今日暂无记录',
      water: {
        label: '饮水',
        unit: 'ml',
        add250: '+250ml',
        add500: '+500ml',
        logged: '已记录',
        target: '每日饮水目标',
      }
    },
    plan: {
      title: '饮食方案',
      optimized: 'AI 已优化',
      generate: '生成新方案',
      apply: '应用到今日',
      applied: '已应用',
      serving: '份',
      unit: '单位'
    },
    chat: {
      title: 'AI 营养师',
      placeholder: '询问关于饮食的问题...',
      send: '发送'
    },
    onboarding: {
      step1: {
        title: "嗨，先让我了解一下你吧",
        gender: '性别',
        age: '年龄',
        height: '身高',
        weight: '体重',
        genders: {
          male: '男',
          female: '女',
          other: '其他'
        }
      },
      step2: {
        title: "你的目标是什么？",
        diet: '饮食偏好',
        goals: {
          fat_loss: { label: '减脂', desc: '燃烧脂肪，打造精实身材' },
          muscle_gain: { label: '增肌', desc: '增强力量，增加肌肉量' },
          gut_health: { label: '改善肠道健康', desc: '调理消化，平衡肠道菌群' }
        },
        gutSymptoms: {
          title: '你有哪些肠道不适？',
          subtitle: '可多选——这能帮我们推荐更适合你的食物。',
          items: {
            bloating: '胀气 / 腹胀',
            constipation: '便秘',
            loose_stools: '腹泻 / 稀便',
            acid_reflux: '胃酸反流 / 烧心',
            cramps: '腹痛 / 痉挛',
            food_intolerance: '食物不耐受（乳糖、麸质等）'
          }
        },
        diets: {
          none: '无限制',
          vegetarian: '素食',
          vegan: '纯素',
          keto: '生酮',
          paleo: '原始饮食'
        }
      },
      step3: {
        title: "你平时容易嘴馋什么？",
        subtitle: "这能帮我们了解你身体的需求——通常是调整营养比例的信号。",
        items: {
          sweets: '甜食',
          fried: '油炸食品',
          salty: '咸味零食',
          carbs: '碳水化合物',
          soda: '苏打饮料',
          none: '没有 / 饮食很干净'
        }
      },
      step4: {
        title: "活动水平",
        type: '主要活动类型',
        intensity: '强度',
        frequency: '频率 (天/周)',
        types: {
          cardio: '有氧',
          strength: '力量',
          mixed: '混合',
          sedentary: '久坐'
        },
        intensities: {
          low: '低',
          moderate: '中',
          high: '高'
        }
      },
      step5: {
        title: '确认每日摄入目标',
        tdeeLabel: '每日能量消耗估算',
        deficitLabel: '推荐热量缺口',
        deficitValue: '300 ~ 500 千卡',
        surplusLabel: '推荐热量盈余',
        surplusDesc: '在 TDEE 基础上增加 10-20%',
        proteinLabel: '蛋白质建议',
        proteinUnit: '克/天',
        targetLabel: '每日饮食摄入推荐',
        targetUnit: '千卡',
        hint: '此数字仅作为参考，你随时可以在个人中心修改。',
        hintMuscle: '增肌期建议在日常消耗基础上多摄入 10-20% 热量，配合力量训练促进肌肉合成。多余热量不只是蛋白质，碳水同样重要。',
        hintGeneral: '根据你的身体数据和活动量估算，此为维持当前体重的推荐摄入量。',
        minWarning: '不能低于安全下限',
      },
      next: '下一步',
      finish: '开启旅程'
    },
    addFood: {
      edit: '编辑食物',
      add: '添加食物',
      camera: '拍照',
      upload: '上传',
      analyzing: '正在分析食物图片...',
      name: '食物名称',
      amount: '分量',
      unit: '单位',
      estimate: '自动估算结果',
      update: '更新',
      units: {
        g: '克 (g)',
        ml: '毫升 (ml)',
        oz: '盎司 (oz)',
        cup: '杯',
        pcs: '个/件'
      }
    },
    mealPlans: {
      title: '饮食计划',
      back: '返回列表',
      replace: '替换',
      addToToday: '添加到今日',
      replaceConfirm: '替换现有记录'
    },
    savePlan: {
      title: '保存饮食计划',
      limitReached: '已达上限',
      limitDesc: '最多保存 5 个计划。请选择下方一个进行覆盖。',
      newPlan: '新计划',
      overwrite: '覆盖',
      planName: '计划名称',
      selectToOverwrite: '选择要覆盖的计划',
      create: '创建计划',
      update: '更新计划',
      noPlans: '暂无计划。',
      noLogs: '没有可保存的记录！',
      limitAlert: '已达上限：你总共只能拥有 5 个饮食计划。请覆盖现有计划。',
      failAlert: '保存饮食计划失败。你可能已达到上限。'
    }
  }
};

export type TranslationKeys = typeof translations.en;
