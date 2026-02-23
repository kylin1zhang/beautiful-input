import Store from 'electron-store'
import { UserSettings, HistoryItem, FloatPosition, defaultSettings } from '@shared/types/index.js'
import { STORAGE_KEYS } from '@shared/constants/index.js'

interface StoreSchema {
  settings: UserSettings
  history: HistoryItem[]
  floatPosition: FloatPosition | null
  firstRun: boolean
}

export class StoreService {
  private store: Store<StoreSchema>

  constructor() {
    this.store = new Store<StoreSchema>({
      name: 'beautiful-input-store',
      defaults: {
        settings: defaultSettings,
        history: [],
        floatPosition: null,
        firstRun: true
      },
      // 加密敏感数据
      encryptionKey: 'beautiful-input-secure-store-key',
      // 数据迁移
      migrations: {
        '>=1.0.0': (store) => {
          // 确保所有必需的字段都存在
          const settings = store.get('settings') as UserSettings
          if (settings) {
            store.set('settings', {
              ...defaultSettings,
              ...settings
            })
          }
        }
      }
    })
  }

  /**
   * 获取设置
   */
  getSettings(): UserSettings {
    return this.store.get('settings')
  }

  /**
   * 保存设置
   */
  setSettings(settings: UserSettings): void {
    this.store.set('settings', settings)
  }

  /**
   * 获取历史记录
   */
  getHistory(): HistoryItem[] {
    return this.store.get('history')
  }

  /**
   * 保存历史记录
   */
  setHistory(history: HistoryItem[]): void {
    this.store.set('history', history)
  }

  /**
   * 获取悬浮球位置
   */
  getFloatPosition(): FloatPosition | null {
    return this.store.get('floatPosition')
  }

  /**
   * 保存悬浮球位置
   */
  setFloatPosition(position: FloatPosition): void {
    this.store.set('floatPosition', position)
  }

  /**
   * 是否是首次运行
   */
  isFirstRun(): boolean {
    return this.store.get('firstRun')
  }

  /**
   * 设置首次运行标志
   */
  setFirstRun(value: boolean): void {
    this.store.set('firstRun', value)
  }

  /**
   * 重置所有数据
   */
  resetAll(): void {
    this.store.clear()
  }

  /**
   * 导出所有数据
   */
  exportAll(): string {
    const data = {
      settings: this.getSettings(),
      history: this.getHistory(),
      floatPosition: this.getFloatPosition(),
      exportTime: new Date().toISOString(),
      version: '1.0.0'
    }
    return JSON.stringify(data, null, 2)
  }

  /**
   * 导入数据
   */
  importAll(jsonString: string): { success: boolean; error?: string } {
    try {
      const data = JSON.parse(jsonString)

      if (data.settings) {
        this.setSettings(data.settings)
      }
      if (data.history && Array.isArray(data.history)) {
        this.setHistory(data.history)
      }
      if (data.floatPosition) {
        this.setFloatPosition(data.floatPosition)
      }

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: '数据格式错误，无法导入'
      }
    }
  }

  /**
   * 获取存储路径
   */
  getStorePath(): string {
    return this.store.path
  }

  /**
   * 获取底层 store 实例（用于其他模块）
   */
  getStore(): Store<StoreSchema> {
    return this.store
  }

  /**
   * 获取存储大小
   */
  getStoreSize(): number {
    return this.store.size
  }

  /**
   * 备份存储
   */
  async backup(backupPath: string): Promise<void> {
    const fs = require('fs').promises
    const data = this.exportAll()
    await fs.writeFile(backupPath, data, 'utf-8')
  }

  /**
   * 从备份恢复
   */
  async restore(backupPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      const fs = require('fs').promises
      const data = await fs.readFile(backupPath, 'utf-8')
      return this.importAll(data)
    } catch (error) {
      return {
        success: false,
        error: '读取备份文件失败'
      }
    }
  }
}
