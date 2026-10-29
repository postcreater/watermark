'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Link2,
  ClipboardPaste,
  X,
  Search,
  Loader2,
  Download,
  Music,
  BadgeCheck,
  Clock3,
  User2,
  Film,
} from 'lucide-react'
import {
  PlatformIcon,
  platformAccent,
  formatDuration,
  formatBytes,
  extractVideoUrl,
  isSupportedVideoUrl,
  type VideoResult,
} from '@/components/site-utils'

interface DlState {
  label: string
  received: number
  total: number
  startedAt: number
  controller: AbortController
}

export default function Downloader() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<VideoResult | null>(null)
  const [dl, setDl] = useState<DlState | null>(null)
  const resultRef = useRef<HTMLDivElement | null>(null)

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

  async function handleFetch(e?: React.FormEvent) {
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
      const res = await fetch('/api/info', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: cleaned }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        toast.error(data.error || 'Could not find the video.')
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

  async function startDownload(kind: 'video' | 'audio', value: number | 'mp3' | 'original') {
    if (!result || dl) return
    const qs = new URLSearchParams({ url: result.sourceUrl })
    if (result.engine === 'tikwm') qs.set('engine', 'tikwm')
    let label = ''
    if (kind === 'video') {
      qs.set('mode', 'video')
      qs.set('height', String(value))
      label = `${value}p MP4`
    } else {
      qs.set('mode', 'audio')
      qs.set('audio', String(value))
      label = value === 'mp3' ? 'MP3 320kbps' : 'Original Audio'
    }

    const controller = new AbortController()
    setDl({ label, received: 0, total: 0, startedAt: Date.now(), controller })
    try {
      const res = await fetch(`/api/download?${qs.toString()}`, { signal: controller.signal })
      if (!res.ok) {
        let msg = 'The download failed.'
        try {
          const j = await res.json()
          if (j?.error) msg = j.error
        } catch {
          /* ignore */
        }
        toast.error(msg)
        setDl(null)
        return
      }
      const total = Number(res.headers.get('content-length') || 0)
      const disposition = res.headers.get('content-disposition') || ''
      let filename = 'download'
      const star = disposition.match(/filename\*=UTF-8''([^;]+)/)
      if (star) {
        try {
          filename = decodeURIComponent(star[1])
        } catch {
          /* ignore */
        }
      } else {
        const plain = disposition.match(/filename="([^"]+)"/)
        if (plain) filename = plain[1]
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('stream unavailable')
      const chunks: Uint8Array[] = []
      let received = 0
      let lastPaint = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          chunks.push(value)
          received += value.length
          const now = Date.now()
          if (now - lastPaint > 120) {
            lastPaint = now
            setDl((prev) => (prev ? { ...prev, received, total } : prev))
          }
        }
      }
      setDl((prev) => (prev ? { ...prev, received, total } : prev))

      const blob = new Blob(chunks as BlobPart[], {
        type: res.headers.get('content-type') || 'application/octet-stream',
      })
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000)
      toast.success('Download complete! The file has been saved.')
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        toast('Download cancelled.')
      } else {
        toast.error('The download was interrupted — please try again.')
      }
    } finally {
      setDl(null)
    }
  }

  const percent = dl && dl.total > 0 ? Math.min(100, Math.round((dl.received / dl.total) * 100)) : null
  const speed = dl ? dl.received / Math.max(1, (Date.now() - dl.startedAt) / 1000) : 0

  return (
    <div className="w-full">
      {/* ------------------------------ input bar ------------------------------ */}
      <form onSubmit={handleFetch} className="mx-auto w-full max-w-2xl">
        <div className="group relative rounded-2xl p-[1px] bg-gradient-to-r from-violet-500/40 via-fuchsia-500/30 to-cyan-400/40 focus-within:from-violet-400 focus-within:via-fuchsia-400 focus-within:to-cyan-300 transition-all duration-300 focus-within:ring-glow">
          <div className="flex items-center gap-2 rounded-2xl glass-strong p-2 pl-4">
            <Link2 className="h-5 w-5 shrink-0 text-violet-300" aria-hidden />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              aria-label="Video link"
              placeholder="Paste your video link here... (https://...)"
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
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-violet-500 bg-[length:200%_100%] hover:bg-right px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 transition-all duration-300 disabled:opacity-70 min-h-[44px]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="hidden sm:inline">Checking...</span>
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  <span className="hidden sm:inline">Search</span>
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
      </form>

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
              <div className="md:flex">
                {/* thumbnail */}
                <div className="relative md:w-80 shrink-0 aspect-video md:aspect-auto bg-gradient-to-br from-violet-900/40 via-zinc-900 to-cyan-900/30">
                  {result.thumbnail ? (
                    <img
                      src={`/api/thumbnail?u=${encodeURIComponent(result.thumbnail)}`}
                      alt={result.title}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  ) : null}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="rounded-full bg-black/50 backdrop-blur px-4 py-3 border border-white/15">
                      <Film className="h-6 w-6 text-white/90" />
                    </div>
                  </div>
                  {result.duration ? (
                    <span className="absolute bottom-3 right-3 rounded-md bg-black/75 px-2 py-1 text-xs font-semibold text-white tabular-nums">
                      {formatDuration(result.duration)}
                    </span>
                  ) : null}
                  <span
                    className={`absolute top-3 left-3 flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-bold text-white ${platformAccent(result.platform)}`}
                  >
                    <PlatformIcon platform={result.platform} className="h-3.5 w-3.5" />
                    {result.platformLabel}
                  </span>
                </div>

                {/* meta + qualities */}
                <div className="flex-1 p-5 sm:p-6">
                  <h3 className="line-clamp-2 text-base sm:text-lg font-bold leading-snug text-zinc-50">
                    {result.title}
                  </h3>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
                    <span className="flex items-center gap-1">
                      <User2 className="h-3.5 w-3.5" /> {result.author}
                    </span>
                    {result.duration ? (
                      <span className="flex items-center gap-1">
                        <Clock3 className="h-3.5 w-3.5" /> {formatDuration(result.duration)}
                      </span>
                    ) : null}
                    {result.watermarkFree && (
                      <span className="flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 font-semibold text-emerald-300">
                        <BadgeCheck className="h-3.5 w-3.5" /> No Watermark
                      </span>
                    )}
                  </div>

                  {result.qualities.length > 0 && (
                    <>
                      <p className="mt-5 text-[11px] font-bold uppercase tracking-widest text-violet-300">
                        Choose Video Quality
                      </p>
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {result.qualities.map((q) => (
                          <button
                            key={q.height}
                            onClick={() => startDownload('video', q.height)}
                            disabled={!!dl}
                            className="group relative rounded-xl border border-white/10 bg-white/[0.03] p-3.5 text-left transition-all hover:border-violet-400/50 hover:bg-violet-400/10 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-base font-extrabold text-zinc-50">{q.label}</span>
                              <Download className="h-4 w-4 text-zinc-500 transition-colors group-hover:text-violet-300" />
                            </div>
                            <div className="mt-1 flex items-center gap-1.5">
                              {q.badge && (
                                <span className="rounded bg-gradient-to-r from-violet-500/30 to-fuchsia-500/30 px-1.5 py-0.5 text-[10px] font-bold text-violet-200">
                                  {q.badge}
                                </span>
                              )}
                              <span className="text-[11px] text-zinc-500">
                                {q.filesize ? formatBytes(q.filesize) : 'MP4'}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* audio row */}
              {result.audio.length > 0 && (
                <div className="border-t border-white/8 bg-black/20 p-5 sm:p-6">
                  <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-cyan-300">
                    <Music className="h-3.5 w-3.5" /> Want audio only?
                  </p>
                  <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                    {result.audio.map((a) => (
                      <button
                        key={a.key}
                        onClick={() => startDownload('audio', a.key)}
                        disabled={!!dl}
                        className="group flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left transition-all hover:border-cyan-400/50 hover:bg-cyan-400/10 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                      >
                        <div>
                          <div className="text-sm font-bold text-zinc-50">{a.label}</div>
                          <div className="mt-0.5 text-[11px] text-zinc-500">{a.detail}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {a.filesize ? (
                            <span className="text-[11px] text-zinc-500">{formatBytes(a.filesize)}</span>
                          ) : null}
                          <span className="rounded-lg bg-cyan-400/15 p-2 text-cyan-300 transition-transform group-hover:scale-110">
                            <Download className="h-4 w-4" />
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ------------------------------ download progress ------------------------------ */}
      <AnimatePresence>
        {dl && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-6 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2"
          >
            <div className="rounded-2xl glass-strong ring-glow p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-zinc-50">Downloading — {dl.label}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-400 tabular-nums">
                    {formatBytes(dl.received)}
                    {dl.total > 0 ? ` / ${formatBytes(dl.total)}` : ''}
                    {' · '}
                    {formatBytes(speed)}/s
                  </p>
                </div>
                <button
                  onClick={() => dl.controller.abort()}
                  className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-red-500/20 transition-colors"
                >
                  Cancel
                </button>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
                {percent !== null ? (
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400 transition-[width] duration-150"
                    style={{ width: `${percent}%` }}
                  />
                ) : (
                  <div className="h-full w-1/2 shimmer rounded-full" />
                )}
              </div>
              {percent !== null && (
                <p className="mt-1.5 text-right text-[11px] font-bold text-violet-300 tabular-nums">{percent}%</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
