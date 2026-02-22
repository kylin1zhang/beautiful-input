# 自定义模型存储路径设计

## 概述

允许用户自定义 Whisper 模型和程序的存储位置，支持从默认路径迁移到新路径。

## 需求

1. 用户可在设置中自定义模型存储路径
2. Whisper 程序与模型在同一目录下统一管理
3. 更改路径时自动迁移已有文件
4. 默认路径：`AppData\Roaming\beautiful-input`
5. 设置页面显示当前路径和磁盘剩余空间

## 设计

### 1. 数据结构变更

在 `LocalModelSettings` 中新增字段：

```typescript
export interface LocalModelSettings {
  enabled: boolean
  selectedModel: LocalModelType
  language: string
  threads: number
  useGpu: boolean
  customModelsPath?: string  // 自定义路径，undefined 表示使用默认路径
}
```

### 2. ModelManager 修改

- 构造函数接收可选的自定义路径参数
- `getModelsDir()` 和 `getWhisperDir()` 方法根据配置返回路径
- 新增 `migrateToPath(newPath)` 方法处理迁移逻辑

### 3. 设置界面修改

在"本地模型设置"区域添加：
- 显示当前存储路径
- 显示该磁盘剩余空间
- "更改位置"按钮 → 打开文件夹选择对话框
- 更改时显示迁移进度，完成后更新配置

### 4. 迁移逻辑

```
1. 用户选择新路径
2. 检查新路径是否有写入权限
3. 检查新路径磁盘空间是否足够
4. 复制所有模型文件和 Whisper 程序到新路径
5. 验证复制成功
6. 删除旧路径文件
7. 更新配置
```

### 5. 错误处理

- 新路径无写入权限 → 提示错误
- 磁盘空间不足 → 提示需要的空间大小
- 迁移过程中断 → 保留旧文件，提示重试
- 路径包含非 ASCII 字符 → 警告可能导致兼容问题

## 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/shared/types/index.ts` | 新增 `customModelsPath` 字段 |
| `src/main/modules/model-manager/index.ts` | 支持动态路径、迁移功能 |
| `src/main/index.ts` | 传递配置路径给 ModelManager |
| `src/renderer/components/Settings.tsx` | 添加路径配置 UI |
| `src/renderer/components/Settings.css` | 样式调整 |
| `src/main/preload.ts` | 新增迁移相关 IPC |
| `src/shared/types/index.ts` | 新增 IpcChannels |
