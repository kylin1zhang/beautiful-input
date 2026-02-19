import React, { useState, useEffect, useCallback } from 'react'
import {
  Search,
  Trash2,
  Download,
  Copy,
  ChevronLeft,
  ChevronRight,
  Clock,
  Monitor,
  Mic,
  FileText,
  X,
  Check,
  MoreVertical,
  Tag
} from 'lucide-react'
import { HistoryItem } from '@shared/types/index.js'
import { formatDateTime, formatDuration, truncateText } from '@shared/utils/index.js'
import './History.css'

const History: React.FC = () => {
  const [items, setItems] = useState<HistoryItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const limit = 10

  // 加载历史记录
  const loadHistory = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.getHistory({ page, limit })
      setItems(result.items)
      setTotal(result.total)
      setTotalPages(result.totalPages)
    } catch (error) {
      console.error('加载历史记录失败:', error)
    } finally {
      setLoading(false)
    }
  }, [page])

  // 搜索历史记录
  const searchHistory = useCallback(async () => {
    if (!searchQuery.trim()) {
      loadHistory()
      return
    }

    setLoading(true)
    try {
      const results = await window.electronAPI.searchHistory(searchQuery)
      setItems(results)
      setTotal(results.length)
      setTotalPages(1)
    } catch (error) {
      console.error('搜索失败:', error)
    } finally {
      setLoading(false)
    }
  }, [searchQuery, loadHistory])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  // 删除历史记录
  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除这条记录吗？')) return

    try {
      await window.electronAPI.deleteHistory(id)
      loadHistory()
    } catch (error) {
      console.error('删除失败:', error)
    }
  }

  // 清空历史记录
  const handleClearAll = async () => {
    if (!window.confirm('确定要清空所有历史记录吗？此操作不可恢复。')) return

    try {
      await window.electronAPI.clearHistory()
      loadHistory()
    } catch (error) {
      console.error('清空失败:', error)
    }
  }

  // 导出历史记录
  const handleExport = async (format: 'txt' | 'md') => {
    try {
      const filePath = await window.electronAPI.exportHistory(format)
      if (filePath) {
        alert(`已导出到: ${filePath}`)
      }
    } catch (error) {
      console.error('导出失败:', error)
    }
  }

  // 复制文本
  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (error) {
      console.error('复制失败:', error)
    }
  }

  // 查看详情
  const handleViewDetail = (item: HistoryItem) => {
    setSelectedItem(item)
    setShowDetail(true)
  }

  // 关闭详情
  const handleCloseDetail = () => {
    setShowDetail(false)
    setSelectedItem(null)
  }

  return (
    <div className="history-container">
      {/* 标题栏 */}
      <div className="history-header">
        <h1>
          <Clock className="header-icon" />
          历史记录
          <span className="record-count">({total} 条)</span>
        </h1>
        <div className="header-actions">
          <button
            className="btn btn-secondary"
            onClick={() => handleExport('md')}
          >
            <Download className="btn-icon" />
            导出 Markdown
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => handleExport('txt')}
          >
            <FileText className="btn-icon" />
            导出文本
          </button>
          <button
            className="btn btn-danger"
            onClick={handleClearAll}
            disabled={total === 0}
          >
            <Trash2 className="btn-icon" />
            清空
          </button>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="search-bar">
        <Search className="search-icon" />
        <input
          type="text"
          placeholder="搜索历史记录..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && searchHistory()}
        />
        {searchQuery && (
          <button
            className="clear-search"
            onClick={() => {
              setSearchQuery('')
              loadHistory()
            }}
          >
            <X className="clear-icon" />
          </button>
        )}
      </div>

      {/* 历史记录列表 */}
      <div className="history-list">
        {loading ? (
          <div className="loading-state">
            <div className="spinner" />
            <span>加载中...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <Clock className="empty-icon" />
            <p>暂无历史记录</p>
            <span>开始录音后，处理结果将显示在这里</span>
          </div>
        ) : (
          items.map(item => (
            <div key={item.id} className="history-item">
              <div className="item-header">
                <div className="item-meta">
                  <span className="item-time">
                    <Clock className="meta-icon" />
                    {formatDateTime(item.timestamp)}
                  </span>
                  <span className="item-app">
                    <Monitor className="meta-icon" />
                    {item.appName}
                  </span>
                  <span className="item-duration">
                    <Mic className="meta-icon" />
                    {formatDuration(item.duration)}
                  </span>
                </div>
                <div className="item-actions">
                  <button
                    className="action-btn"
                    onClick={() => handleCopy(item.processedText, item.id)}
                    title="复制"
                  >
                    {copiedId === item.id ? (
                      <Check className="action-icon success" />
                    ) : (
                      <Copy className="action-icon" />
                    )}
                  </button>
                  <button
                    className="action-btn"
                    onClick={() => handleViewDetail(item)}
                    title="查看详情"
                  >
                    <MoreVertical className="action-icon" />
                  </button>
                  <button
                    className="action-btn danger"
                    onClick={() => handleDelete(item.id)}
                    title="删除"
                  >
                    <Trash2 className="action-icon" />
                  </button>
                </div>
              </div>

              <div className="item-content">
                <div className="text-preview">
                  <p className="processed-text">
                    {truncateText(item.processedText, 150)}
                  </p>
                  {item.originalText !== item.processedText && (
                    <p className="original-text">
                      原文: {truncateText(item.originalText, 100)}
                    </p>
                  )}
                </div>
                {item.tags.length > 0 && (
                  <div className="item-tags">
                    {item.tags.map((tag, index) => (
                      <span key={index} className="tag">
                        <Tag className="tag-icon" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 分页 */}
      {!searchQuery && totalPages > 1 && (
        <div className="pagination">
          <button
            className="page-btn"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="page-icon" />
          </button>
          <span className="page-info">
            第 {page} / {totalPages} 页
          </span>
          <button
            className="page-btn"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            <ChevronRight className="page-icon" />
          </button>
        </div>
      )}

      {/* 详情弹窗 */}
      {showDetail && selectedItem && (
        <div className="detail-modal" onClick={handleCloseDetail}>
          <div className="detail-content" onClick={e => e.stopPropagation()}>
            <div className="detail-header">
              <h2>记录详情</h2>
              <button className="close-btn" onClick={handleCloseDetail}>
                <X className="close-icon" />
              </button>
            </div>

            <div className="detail-body">
              <div className="detail-meta">
                <div className="meta-item">
                  <Clock className="meta-icon" />
                  <span>{formatDateTime(selectedItem.timestamp)}</span>
                </div>
                <div className="meta-item">
                  <Monitor className="meta-icon" />
                  <span>{selectedItem.appName}</span>
                </div>
                <div className="meta-item">
                  <Mic className="meta-icon" />
                  <span>{formatDuration(selectedItem.duration)}</span>
                </div>
              </div>

              <div className="detail-section">
                <h3>处理后文本</h3>
                <div className="text-box">
                  <p>{selectedItem.processedText}</p>
                  <button
                    className="copy-btn"
                    onClick={() => handleCopy(selectedItem.processedText, 'detail-processed')}
                  >
                    {copiedId === 'detail-processed' ? (
                      <Check className="copy-icon success" />
                    ) : (
                      <Copy className="copy-icon" />
                    )}
                  </button>
                </div>
              </div>

              {selectedItem.originalText !== selectedItem.processedText && (
                <div className="detail-section">
                  <h3>原始文本</h3>
                  <div className="text-box original">
                    <p>{selectedItem.originalText}</p>
                    <button
                      className="copy-btn"
                      onClick={() => handleCopy(selectedItem.originalText, 'detail-original')}
                    >
                      {copiedId === 'detail-original' ? (
                        <Check className="copy-icon success" />
                      ) : (
                        <Copy className="copy-icon" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {selectedItem.tags.length > 0 && (
                <div className="detail-section">
                  <h3>标签</h3>
                  <div className="detail-tags">
                    {selectedItem.tags.map((tag, index) => (
                      <span key={index} className="tag">
                        <Tag className="tag-icon" />
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="detail-footer">
              <button
                className="btn btn-secondary"
                onClick={() => handleDelete(selectedItem.id)}
              >
                <Trash2 className="btn-icon" />
                删除
              </button>
              <button
                className="btn btn-primary"
                onClick={() => handleCopy(selectedItem.processedText, 'detail-footer')}
              >
                {copiedId === 'detail-footer' ? (
                  <>
                    <Check className="btn-icon" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="btn-icon" />
                    复制文本
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default History
