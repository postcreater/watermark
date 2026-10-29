'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, Sparkles, ImageIcon } from 'lucide-react'
import Downloader from '@/components/downloader'
import PromptPanel from '@/components/prompt-panel'
import PhotoPrompt from '@/components/photo-prompt'

type Mode = 'download' | 'videoPrompt' | 'photoPrompt'

const TABS: Array<{
  key: Mode
  label: string
  icon: typeof Download
  ai?: boolean
  gradient: string
}> = [
  {
    key: 'download',
    label: 'Video Download',
    icon: Download,
    gradient: 'from-violet-500 to-fuchsia-500',
  },
  {
    key: 'videoPrompt',
    label: 'Video to Prompt',
    icon: Sparkles,
    ai: true,
    gradient: 'from-cyan-400 via-fuchsia-500 to-violet-500',
  },
  {
    key: 'photoPrompt',
    label: 'Photo to Prompt',
    icon: ImageIcon,
    ai: true,
    gradient: 'from-amber-400 via-fuchsia-500 to-violet-500',
  },
]

export default function HeroTabs() {
  const [mode, setMode] = useState<Mode>('download')

  return (
    <div className="w-full">
      {/* segmented control */}
      <div className="mx-auto mb-8 flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04] p-1.5 backdrop-blur">
        {TABS.map((t) => {
          const active = mode === t.key
          return (
            <button
              key={t.key}
              onClick={() => setMode(t.key)}
              aria-pressed={active}
              className={`relative flex shrink-0 items-center gap-2 rounded-xl px-4 sm:px-5 py-2.5 text-sm font-bold transition-all min-h-[44px] ${
                active ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="tab-pill"
                  className={`absolute inset-0 rounded-xl bg-gradient-to-r ${t.gradient} shadow-lg shadow-fuchsia-500/25`}
                  transition={{ type: 'spring', bounce: 0.18, duration: 0.5 }}
                />
              )}
              <span className="relative flex items-center gap-2">
                <t.icon className="h-4 w-4" />
                <span className="whitespace-nowrap">{t.label}</span>
                {t.ai && (
                  <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide">
                    AI
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
        >
          {mode === 'download' ? (
            <Downloader />
          ) : mode === 'videoPrompt' ? (
            <PromptPanel />
          ) : (
            <PhotoPrompt />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
