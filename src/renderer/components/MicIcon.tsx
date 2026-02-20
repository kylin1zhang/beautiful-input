import React from 'react'

interface MicIconProps {
  className?: string
  size?: number
}

/**
 * 自定义话筒图标 - 基于 BeautifulInput 应用图标设计
 */
const MicIcon: React.FC<MicIconProps> = ({ className, size = 24 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* 话筒主体 */}
      <rect
        x="8.5"
        y="4"
        width="7"
        height="10"
        rx="3.5"
        fill="currentColor"
      />

      {/* 话筒网格线 */}
      <line x1="8.5" y1="7" x2="15.5" y2="7" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
      <line x1="8.5" y1="9.5" x2="15.5" y2="9.5" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
      <line x1="8.5" y1="12" x2="15.5" y2="12" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />

      {/* 话筒支架 */}
      <path d="M12 14 L12 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />

      {/* 话筒底座 */}
      <ellipse cx="12" cy="17.5" rx="3" ry="1" fill="currentColor" />

      {/* 左侧声波 */}
      <path
        d="M5.5 9 Q4 12 5.5 15"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
      />
      <path
        d="M3.5 7 Q1.5 12 3.5 17"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
        opacity="0.5"
      />

      {/* 右侧声波 */}
      <path
        d="M18.5 9 Q20 12 18.5 15"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
      />
      <path
        d="M20.5 7 Q22.5 12 20.5 17"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
        opacity="0.5"
      />
    </svg>
  )
}

export default MicIcon
