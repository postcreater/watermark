'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Link2,
  ClipboardPaste,
  X,
  Sparkles,
  Loader2,
  Copy,
  Check,
  Clock3,
  Wand2,
} from 'lucide-react'
import {
  PlatformIcon,
  platformAccent,
  formatDuration,
  extractVideoUrl,
  isSupportedVideoUrl,
  type AnalyzeResult,
} from '@/components/site-utils'

const LOADING_STEPS = [
  'Downloading the video...',
  'Processing the video...',
  'AI is watching and analyzing the video...',
  'Writing the prompt...',
]

const ELEMENT_LABELS: Record<string, string> = {
  subject: 'Subject',
  scene: 'Scene',
  action: 'Action',
  camera: 'Camera',
  lighting: 'Lighting',
  style: 'Style',
  mood: 'Mood',
}

export default function PromptPanel() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(0)
  const [result, setResult] = useState<AnalyzeResult | null>(null)
  const [copied, setCopied] = useState<'prompt' | 'tags' | null>(null)
  const resultRef = useRef<HTMLDivElement | null>(null)
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (loading) {
      setStep(0)
      stepTimer.current = setInterval(() => {
        setStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1))
      }, 7000)
    } else if (stepTimer.current) {
      clearInterval(stepTimer.current)
      stepTimer.current = null
    }
    return () => {
      if (stepTimer.current) clearInterval(stepTimer.current)
    }
  }, [loading])

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText()
      if (!text) {
        toast.error('The clipboard is empty — copy a link first.')
        return
      }
      const clean = extractVideoUrl(text) || text.trim()
      setUrl(clean)
      toast.success('Link pasted!')
    } catch {
      toast.error('Clipboard access is blocked — paste the link manually.')
    }
  }

  async function handleAnalyze(e?: React.FormEvent) {
    e?.preventDefault()
    const target = url.trim()
    if (!target) {
      toast.error('Paste a video link first.')
      return
    }
    const cleaned = extractVideoUrl(target) || target
    if (!isSupportedVideoUrl(cleaned)) {
      toast.error('This link is not supported. Please use a YouTube / TikTok / Instagram / Facebook link.')
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: cleaned }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        toast.error(data.error || 'The AI analysis failed.')
        return
      }
      setResult(data)
      requestAnimationFrame(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    } catch {
      toast.error('A network error occurred — check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  async function copyText(text: string, kind: 'prompt' | 'tags') {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      toast.success(kind === 'prompt' ? 'Prompt copied!' : 'Tags copied!')
      setTimeout(() => setCopied(null), 2000)
    } catch {
      toast.error('Could not copy — please select the text manually.')
    }
  }

  return (
    <div className="w-full">
      {/* ------------------------------ input bar ------------------------------ */}
      <form onSubmit={handleAnalyze} className="mx-auto w-full max-w-2xl">
        <div className="relative rounded-2xl p-[1px] bg-gradient-to-r from-cyan-400/40 via-fuchsia-500/30 to-violet-500/40 focus-within:from-cyan-300 focus-within:via-fuchsia-400 focus-within:to-violet-400 transition-all duration-300 focus-within:ring-glow">
          <div className="flex items-center gap-2 rounded-2xl glass-strong p-2 pl-4">
            <Link2 className="h-5 w-5 shrink-0 text-fuchsia-300" aria-hidden />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              aria-label="Video link for AI analysis"
              placeholder="Paste a video link — the AI will analyze it..."
              className="min-w-0 flex-1 bg-transparent text-sm sm:text-base text-zinc-100 placeholder:text-zinc-500 outline-none py-2"
            />
            {url && (
              <button
                type="button"
                onClick={() => setUrl('')}
                aria-label="Clear"
                className="rounded-full p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={handlePaste}
              className="hidden sm:flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ClipboardPaste className="h-3.5 w-3.5" /> Paste
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-violet-500 bg-[length:200%_100%] hover:bg-right px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 transition-all duration-300 disabled:opacity-70 min-h-[44px]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="hidden sm:inline">Analyzing...</span>
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Analyze</span>
                </>
              )}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={handlePaste}
          className="sm:hidden mx-auto mt-3 flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-zinc-300"
        >
          <ClipboardPaste className="h-3.5 w-3.5" /> Paste from Clipboard
        </button>
        <p className="mt-4 text-center text-[11px] text-zinc-500">
          Works for videos under 3 minutes • Ready for Sora / Veo / Kling / Runway prompts
        </p>
      </form>

      {/* ------------------------------ loading card ------------------------------ */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="mx-auto mt-10 w-full max-w-2xl"
          >
            <div className="rounded-3xl glass p-6">
              <div className="flex items-center gap-3">
                <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/20 to-fuchsia-500/20 border border-fuchsia-400/20">
                  <Sparkles className="h-5 w-5 text-fuchsia-300 animate-pulse" />
                </span>
                <div>
                  <p className="text-sm font-bold text-zinc-100">{LOADING_STEPS[step]}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    Takes about 20–60 seconds depending on video length — hang tight
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-3 rounded-full shimmer" style={{ width: `${90 - i * 18}%` }} />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ------------------------------ result card ------------------------------ */}
      <AnimatePresence>
        {result && (
          <motion.div
            ref={resultRef}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="mx-auto mt-10 w-full max-w-3xl scroll-mt-24"
          >
            <div className="overflow-hidden rounded-3xl glass ring-glow">
              {/* header */}
              <div className="flex items-center gap-4 border-b border-white/8 p-5 sm:p-6">
                {result.thumbnail ? (
                  <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-zinc-800">
                    <img
                      src={`/api/thumbnail?u=${encodeURIComponent(result.thumbnail)}`}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  </div>
                ) : null}
                <div className="min-w-0 flex-1">
                  <h3 className="line-clamp-1 text-sm sm:text-base font-bold text-zinc-50">
                    {result.title}
                  </h3>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-400">
                    <span
                      className={`flex items-center gap-1 rounded-md px-2 py-0.5 font-bold text-white ${platformAccent(result.platform)}`}
                    >
                      <PlatformIcon platform={result.platform} className="h-3 w-3" />
                    </span>
                    {result.duration ? (
                      <span className="flex items-center gap-1">
                        <Clock3 className="h-3 w-3" /> {formatDuration(result.duration)}
                      </span>
                    ) : null}
                    <span className="flex items-center gap-1 text-fuchsia-300">
                      <Sparkles className="h-3 w-3" /> AI Generated Prompt
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-5 sm:p-6 space-y-6">
                {/* main prompt */}
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-fuchsia-300">
                      <Wand2 className="h-3.5 w-3.5" /> AI Video Prompt
                    </p>
                    <button
                      onClick={() => copyText(result.prompt, 'prompt')}
                      className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-fuchsia-500/80 to-violet-500/80 px-3.5 py-1.5 text-xs font-bold text-white transition-transform hover:scale-105 min-h-[36px]"
                    >
                      {copied === 'prompt' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied === 'prompt' ? 'Copied!' : 'Copy Prompt'}
                    </button>
                  </div>
                  <div className="mt-3 rounded-2xl border border-fuchsia-400/20 bg-gradient-to-br from-fuchsia-500/[0.07] to-violet-500/[0.07] p-4 sm:p-5">
                    <p className="text-sm leading-relaxed text-zinc-100 whitespace-pre-wrap">
                      {result.prompt}
                    </p>
                  </div>
                </div>

                {/* description */}
                {result.description && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-cyan-300">
                      What happens in this video
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-300">{result.description}</p>
                  </div>
                )}

                {/* elements */}
                {Object.keys(result.elements).length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-violet-300">
                      Key Elements
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {Object.entries(result.elements)
                        .filter(([, v]) => v)
                        .map(([k, v]) => (
                          <div key={k} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-violet-300">
                              {ELEMENT_LABELS[k] || k}
                            </span>
                            <p className="mt-1 text-xs leading-relaxed text-zinc-300">{v}</p>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* tags */}
                {result.tags.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] font-bold uppercase tracking-widest text-cyan-300">
                        Tags
                      </p>
                      <button
                        onClick={() => copyText(result.tags.map((t) => `#${t.replace(/\s+/g, '')}`).join(' '), 'tags')}
                        className="flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-bold text-cyan-200 transition-colors hover:bg-cyan-400/20 min-h-[32px]"
                      >
                        {copied === 'tags' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        Copy Tags
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {result.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-zinc-300"
                        >
                          #{t.replace(/\s+/g, '')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
