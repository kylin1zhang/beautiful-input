// API 配置
export const API_CONFIG = {
  GROQ: {
    BASE_URL: 'https://api.groq.com/openai/v1',
    WHISPER_MODEL: 'whisper-large-v3',
    MAX_FILE_SIZE: 60 * 1024 * 1024, // 60MB (支持30分钟录音)
    SUPPORTED_FORMATS: ['flac', 'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'ogg', 'wav', 'webm']
  },
  DEEPSEEK: {
    BASE_URL: 'https://api.deepseek.com/v1',
    MODEL: 'deepseek-chat',
    MAX_TOKENS: 4096,
    TEMPERATURE: 0.3
  },
  QWEN: {
    BASE_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    MODEL: 'qwen-plus',
    MAX_TOKENS: 4096,
    TEMPERATURE: 0.3
  }
} as const

// 录音配置
export const RECORDING_CONFIG = {
  SAMPLE_RATE: 16000,
  CHANNELS: 1,
  BIT_DEPTH: 16,
  MAX_DURATION: 1800, // 30分钟（秒）
  MIN_DURATION: 1,   // 1秒（秒）
  CHUNK_SIZE: 1024   // 音频块大小
} as const

// UI 配置
export const UI_CONFIG = {
  FLOAT_BALL: {
    SIZE: 64,
    MARGIN: 20,
    ANIMATION_DURATION: 200,
    WAVE_BARS: 20
  },
  WINDOW: {
    SETTINGS: {
      WIDTH: 600,
      HEIGHT: 700
    },
    HISTORY: {
      WIDTH: 800,
      HEIGHT: 600
    }
  },
  COLORS: {
    PRIMARY: '#3B82F6',
    SECONDARY: '#8B5CF6',
    SUCCESS: '#10B981',
    WARNING: '#F59E0B',
    ERROR: '#EF4444',
    IDLE: '#6B7280',
    RECORDING: '#EF4444',
    PROCESSING: '#3B82F6'
  }
} as const

// 错误消息
export const ERROR_MESSAGES = {
  PERMISSION_DENIED: {
    title: '权限不足',
    message: '请允许 BeautifulInput 访问麦克风和辅助功能',
    action: '打开系统设置'
  },
  NETWORK_ERROR: {
    title: '网络错误',
    message: '请检查网络连接后重试',
    action: '重试'
  },
  API_ERROR: {
    title: 'API 错误',
    message: '请检查 API Key 配置是否正确',
    action: '打开设置'
  },
  AUDIO_ERROR: {
    title: '录音错误',
    message: '无法访问麦克风，请检查设备',
    action: '重试'
  },
  INPUT_ERROR: {
    title: '输入错误',
    message: '无法将文本输入到当前应用',
    action: '已复制到剪贴板'
  },
  AI_ERROR: {
    title: 'AI 处理错误',
    message: 'AI 处理失败，已返回原始文本',
    action: '确定'
  },
  UNKNOWN_ERROR: {
    title: '未知错误',
    message: '发生未知错误，请稍后重试',
    action: '确定'
  }
} as const

// AI 提示词模板
export const AI_PROMPTS = {
  CLEAN: `你是文本清理助手。请分析文本类型并分别处理：

【判断标准】
- 引用/原文：包含引号、书名号、作者标注，或明显是名言/格言/诗词
- 用户表述：日常口语、自己的想法表达

【处理规则】

如果是引用/原文：
- 完全保持原样，不做任何修改
- 保留所有标点符号、格式、用词

如果是用户表述：
1. 删除填充词：嗯、啊、那个、就是、然后、呃、这个等
2. 删除重复内容（如"我我我"、"就是就是"）
3. 修正明显的语病（如"我想要去去去"→"我想要去"）
4. 保持原有语气和用词风格

严格禁止：
- 为用户"总结"或"概括"内容
- 提供"解决方案"或"建议"
- 将用户的话改写成"可行的方案"
- 添加任何新内容

直接输出清理后的文本，不要添加任何说明或分类标注。

文本：
{{text}}`,

  FORMAT: `请将以下文本整理成结构化的格式。要求：
1. 根据内容自动判断最合适的格式（列表、段落、步骤等）
2. 使用适当的标题和层级
3. 保持逻辑清晰
4. 保留关键信息

文本：
{{text}}`,

  TRANSLATE: `请将以下文本翻译成{{language}}。要求：
1. 保持原意准确
2. 符合目标语言的表达习惯
3. 保留专有名词（可适当音译或保留原文）
4. 保持格式和结构

文本：
{{text}}`,

  ASSISTANT_SUMMARIZE: `请对以下文本进行总结。要求：
1. 提取核心要点
2. 简明扼要
3. 保持逻辑清晰

文本：
{{text}}`,

  ASSISTANT_EXPLAIN: `请解释以下文本的内容。要求：
1. 用通俗易懂的语言
2. 适当举例说明
3. 解释专业术语

文本：
{{text}}`,

  ASSISTANT_EXPAND: `请对以下文本进行扩展。要求：
1. 增加细节和背景信息
2. 补充相关知识点
3. 保持主题一致

文本：
{{text}}`,

  TONE_FORMAL: `请使用正式的语调改写以下文本。要求：
1. 使用规范的书面语
2. 避免口语化表达
3. 适合商务或学术场景

文本：
{{text}}`,

  TONE_CASUAL: `请使用随意的语调改写以下文本。要求：
1. 轻松自然的表达
2. 适合日常交流
3. 保持友好亲切

文本：
{{text}}`,

  TONE_PROFESSIONAL: `请使用专业的语调改写以下文本。要求：
1. 准确使用专业术语
2. 逻辑严谨
3. 适合工作场景

文本：
{{text}}`,

  TONE_CREATIVE: `请使用富有创意的语调改写以下文本。要求：
1. 生动形象的表达
2. 适当使用修辞手法
3. 富有感染力

文本：
{{text}}`
} as const

// 支持的语言
export const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', name: '简体中文' },
  { code: 'zh-TW', name: '繁體中文' },
  { code: 'en', name: 'English' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'ru', name: 'Русский' }
] as const

// 语调风格
export const TONE_STYLES = [
  { value: 'formal', label: '正式', description: '适合商务、学术场景' },
  { value: 'casual', label: '随意', description: '轻松自然的日常表达' },
  { value: 'professional', label: '专业', description: '准确严谨的工作场景' },
  { value: 'creative', label: '创意', description: '生动形象的表达' }
] as const

// 存储键名
export const STORAGE_KEYS = {
  SETTINGS: 'beautiful-input-settings',
  HISTORY: 'beautiful-input-history',
  FLOAT_POSITION: 'beautiful-input-float-position',
  FIRST_RUN: 'beautiful-input-first-run'
} as const

// 应用信息
export const APP_INFO = {
  NAME: 'BeautifulInput',
  VERSION: '1.0.0',
  DESCRIPTION: 'AI语音输入工具',
  AUTHOR: 'BeautifulInput Team',
  WEBSITE: 'https://beautifulinput.app',
  GITHUB: 'https://github.com/beautifulinput/beautifulinput'
} as const

// 本地 Whisper 模型配置
export const LOCAL_WHISPER_MODELS: Record<string, {
  name: string
  size: number
  sha256: string
  url: string
}> = {
  'base': {
    name: 'Base',
    size: 142 * 1024 * 1024,  // 142MB
    sha256: '',  // TODO: 填入实际 SHA256
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin'
  },
  'small': {
    name: 'Small',
    size: 466 * 1024 * 1024,  // 466MB
    sha256: '',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin'
  },
  'medium': {
    name: 'Medium',
    size: 1500 * 1024 * 1024,  // 1.5GB
    sha256: '',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin'
  },
  'large-v3': {
    name: 'Large V3',
    size: 2900 * 1024 * 1024,  // 2.9GB
    sha256: '',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin'
  }
}

// 国内镜像下载地址
export const LOCAL_WHISPER_MIRROR_URLS: Record<string, string[]> = {
  'base': [
    'https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-base.bin'
  ],
  'small': [
    'https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-small.bin'
  ],
  'medium': [
    'https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin'
  ],
  'large-v3': [
    'https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin'
  ]
}

// Whisper.cpp 可执行文件配置
export const WHISPER_EXECUTABLES = {
  win32: {
    cuda: 'whisper-cuda.exe',
    cpu: 'whisper.exe'
  },
  darwin: {
    metal: 'whisper-metal',
    cpu: 'whisper'
  },
  linux: {
    cuda: 'whisper-cuda',
    cpu: 'whisper'
  }
}
