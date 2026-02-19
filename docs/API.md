# Typeless API 使用指南

## 概述

Typeless 使用两个主要的 AI API：

1. **Groq Whisper API** - 语音识别
2. **DeepSeek API** - AI 文本处理

## Groq Whisper API

### 获取 API Key

1. 访问 [Groq Console](https://console.groq.com)
2. 注册账号
3. 在 API Keys 页面创建新的 API Key
4. 复制 API Key 到 Typeless 设置中

### 费用

- Whisper 模型：$0.006/分钟
- 新用户有免费额度

### 支持的格式

- flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm

### 限制

- 最大文件大小：25MB
- 支持多语言识别
- 支持中英混说

## DeepSeek API

### 获取 API Key

1. 访问 [DeepSeek Platform](https://platform.deepseek.com)
2. 注册账号
3. 在 API Keys 页面创建新的 API Key
4. 复制 API Key 到 Typeless 设置中

### 费用

- DeepSeek Chat：约 $0.001/1K tokens
- 新用户有免费额度

### 模型

- `deepseek-chat` - 通用对话模型
- 支持 64K 上下文
- 支持中文优化

### 限制

- 每分钟请求数限制
- 每日 token 限制

## 在 Typeless 中配置

### 通过设置窗口

1. 右键点击悬浮球
2. 选择"设置"
3. 在"API 配置"标签页中输入 API Keys
4. 点击"保存"

### 通过配置文件

配置文件位置：

- **macOS**: `~/Library/Application Support/typeless/config.json`
- **Windows**: `%APPDATA%/typeless/config.json`
- **Linux**: `~/.config/typeless/config.json`

格式：

```json
{
  "groqApiKey": "your_groq_api_key",
  "deepseekApiKey": "your_deepseek_api_key"
}
```

## 故障排除

### API Key 无效

**症状**: 提示 "API Key 无效"

**解决方案**:
1. 检查 API Key 是否复制完整
2. 确认 API Key 没有过期
3. 重新生成 API Key

### 请求过于频繁

**症状**: 提示 "请求过于频繁"

**解决方案**:
1. 等待几分钟后重试
2. 降低使用频率
3. 升级 API 套餐

### 网络错误

**症状**: 提示 "网络错误"

**解决方案**:
1. 检查网络连接
2. 检查防火墙设置
3. 尝试使用 VPN

### 余额不足

**症状**: 提示 "账户余额不足"

**解决方案**:
1. 充值账户
2. 检查使用配额

## 成本估算

### 单次使用成本

假设平均录音时长 30 秒：

1. **语音识别** (Groq)
   - 30 秒 = 0.5 分钟
   - 成本：0.5 × $0.006 = $0.003

2. **AI 处理** (DeepSeek)
   - 假设 500 tokens
   - 成本：500 × $0.001/1000 = $0.0005

**单次总成本**: 约 $0.0035

### 月度成本估算

| 使用次数 | 估算成本 |
|---------|---------|
| 100 次/月 | $0.35 |
| 500 次/月 | $1.75 |
| 1000 次/月 | $3.50 |
| 5000 次/月 | $17.50 |

## 优化建议

### 降低 API 成本

1. **控制录音时长**
   - 尽量简洁表达
   - 避免过长的停顿

2. **使用个人词典**
   - 添加常用专有名词
   - 提高识别准确率

3. **选择合适的语调风格**
   - 根据场景选择
   - 避免不必要的处理

### 提高识别准确率

1. **使用个人词典**
   - 添加专业术语
   - 添加人名地名

2. **清晰发音**
   - 保持适当的语速
   - 避免背景噪音

3. **使用合适的麦克风**
   - 推荐使用降噪麦克风
   - 保持适当的距离

## 隐私说明

- API Keys 仅存储在本地
- 音频数据仅用于 API 调用
- 不会收集用户数据用于训练
- 所有网络传输使用 HTTPS 加密

## 相关链接

- [Groq 官网](https://groq.com)
- [Groq API 文档](https://console.groq.com/docs)
- [DeepSeek 官网](https://deepseek.com)
- [DeepSeek API 文档](https://platform.deepseek.com/docs)
