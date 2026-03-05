# Smart Diet Tracker (智能饮食追踪助手)

这是一个基于 AI 的个性化饮食管理应用，旨在通过多模态输入（语音/文字/图片）轻松记录饮食，提供实时的营养分析，并根据用户的生活惯例和目标生成优化的膳食计划。

## 🎯 产品目标
帮助用户通过智能化的手段管理饮食，不仅是记录，更是通过 AI 理解用户的生活习惯，提供切实可行的饮食优化建议。

## 📱 功能模块详解

### 1. 用户引导 (Onboarding)
用户首次进入应用时，通过分步表单收集基础信息，用于计算代谢率和生成个性化建议。
*   **基础信息**：身高、体重（下拉选择）、性别、年龄。
*   **目标设定**：减脂 (Fat Loss)、增肌 (Muscle Gain)、维持 (Maintain)。
*   **饮食偏好**：无限制、素食、生酮等选项。
*   **活动量详情**：
    *   **类型**：有氧、力量、混合、久坐。
    *   **强度**：低、中、高。
    *   **频率**：每周运动天数 (1-2, 3-4, 5+)。

### 2. 智能对话 (Chat - Tab 1)
这是应用的核心交互入口，承担了“生活惯例收集”和“饮食咨询”的双重职能。
*   **生活惯例收集 (Routine Collection)**：
    *   AI 会主动询问用户的日常作息（如起床时间、就餐时间、工作日的饮食限制）。
    *   目的是理解用户“在什么时间、方便吃什么”。
*   **智能优化 (Optimization)**：
    *   AI 识别用户输入的饮食内容（食物、分量）。
    *   根据用户目标提供优化建议（例如：“晚餐碳水稍高，建议将米饭减半，增加一份蔬菜”）。
*   **膳食计划生成 (Meal Plan Generation)**：
    *   当用户采纳建议后，AI 会生成一份结构化的 **Meal Plan**。
    *   这份计划会自动同步到 **Record** 页面供用户一键记录。
*   **多模态输入**：支持文字输入，预留语音和图片上传接口（用于拍照识别食物热量）。

### 3. 饮食记录 (Record - Tab 2)
可视化的饮食仪表盘，展示当日摄入情况与 AI 建议的对比。
*   **营养仪表盘**：
    *   使用环形图展示四大核心指标：**Protein (蛋白质)**, **Carb (碳水)**, **Fat (脂肪)**, **Veggie (蔬菜)**。
    *   实时显示今日已摄入热量 vs 目标热量。
*   **餐食列表 (Meal List)**：
    *   分为 Breakfast, Lunch, Dinner, Snack 四个板块。
*   **智能计划卡片 (Smart Plan Card)**：
    *   **逻辑**：当某餐（如午餐）尚未记录时，会自动展示在 Chat 页面生成的 **优化膳食计划**。
    *   **操作**：用户点击 "Log this meal" 即可一键将计划填入记录。
    *   **状态**：当该餐已有记录时，计划卡片默认收起，保持界面整洁。

### 4. 个人中心 (Me - Tab 3)
*   展示用户的档案信息。
*   查看当前的目标设置和活动量配置。

## 🔄 交互流程 (User Flow)
1.  **Onboarding** -> 输入身体数据 & 目标。
2.  **Chat** -> AI 询问生活惯例 -> 用户回答 -> AI 生成优化建议 & 膳食计划。
3.  **Record** -> 查看 AI 生成的计划 -> 一键打卡记录 -> 查看营养分布图表。
4.  **Loop** -> 每日通过 Chat 或 Record 持续追踪。

## 🛠 技术架构
*   **前端框架**: React 19, Vite
*   **样式库**: Tailwind CSS (配合 clsx/tailwind-merge)
*   **动画**: Motion (Framer Motion)
*   **图表**: Recharts
*   **路由**: React Router DOM
*   **AI 服务**:
    *   当前: DashScope OpenAI 兼容接口（`qwen3.5-plus` + `qwen-vl-max-latest`）
    *   计划: 增加模型路由与热量数据库换算
*   **数据流**: React Context API + LocalStorage (Demo)
*   **部署**: Vercel (Target)

## 📝 开发备注
*   **API Key**: 当前使用 `DASHSCOPE_API_KEY`（或 `VITE_DASHSCOPE_API_KEY`）进行本地开发。生产环境建议迁移至 Serverless Function (如 Vercel Edge Functions) 以保护密钥。
*   **JSON Output**: AI Prompt 经过专门设计，强制输出 JSON 格式的 Meal Plan 以便前端解析和渲染。

## 🔌 模型接口记录（进行中）

### Seed-2.0-lite（图像识别）

- **用途**：食物图片识别（后续可接热量估算与结构化解析）
- **服务地址**：`https://ark.cn-beijing.volces.com/api/v3/responses`
- **模型名**：`doubao-seed-2-0-lite-260215`
- **鉴权**：`Authorization: Bearer $ARK_API_KEY`

> 安全提醒：不要把真实 API Key 写入仓库；请通过环境变量注入。

#### 调用示例（curl）

```bash
curl https://ark.cn-beijing.volces.com/api/v3/responses \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "doubao-seed-2-0-lite-260215",
    "input": [
      {
        "role": "user",
        "content": [
          {
            "type": "input_image",
            "image_url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/ark_demo_img_1.png"
          },
          {
            "type": "input_text",
            "text": "你看见了什么？"
          }
        ]
      }
    ]
  }'
```

#### 建议的环境变量

```bash
export ARK_API_KEY="your_ark_api_key"
```

### DeepSeek-R1（文本推理/饮食计划）

- **用途**：复杂文本推理、个性化饮食计划生成与调整
- **服务地址**：`https://ark.cn-beijing.volces.com/api/v3/chat/completions`
- **模型名**：`deepseek-r1-250528`
- **鉴权**：`Authorization: Bearer $ARK_API_KEY`

#### 调用示例（curl）

```bash
curl https://ark.cn-beijing.volces.com/api/v3/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "deepseek-r1-250528",
    "messages": [
      {"role": "system", "content": "你是人工智能助手。"},
      {"role": "user", "content": "你好"}
    ]
  }'
```

#### 建议路由（当前版本）

- 图片识别：`doubao-seed-2-0-lite-260215`
- 计划生成/复杂推理：`deepseek-r1-250528`

> 安全提醒：你在聊天里发过明文 key，建议尽快在控制台轮换该 key，并改为仅通过环境变量注入。
