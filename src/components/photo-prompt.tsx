'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ImagePlus,
  X,
  Sparkles,
  Loader2,
  Copy,
  Check,
  Wand2,
  RefreshCw,
} from 'lucide-react'

interface PhotoAnalysis {
  ok: true
  prompt: string
  negativePrompt: string
  description: string
  elements: Record<string, string>
  tags: string[]
}

const LOADING_STEPS = [
  'Uploading your photo...',
  'AI is studying every detail...',
  'Writing the prompt...',
]

const ELEMENT_LABELS: Record<string, string> = {
  subject: 'Subject',
  scene: 'Scene',
  camera: 'Camera',
  lighting: 'Lighting',
  style: 'Style',
  mood: 'Mood',
}

const MAX_FILE_MB = 15

/** Downscale big images client-side so uploads stay fast (max 1280px, JPEG 85%). */
async function fileToDataUrl(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = () => reject(new Error('read failed'))
    fr.readAsDataURL(file)
  })

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image()
      im.onload = () => resolve(im)
      im.onerror = () => reject(new Error('decode failed'))
      im.src = dataUrl
    })
    const maxSide = Math.max(img.width, img.height)
    if (maxSide <= 1280 && dataUrl.length < 3_000_000) return dataUrl

    const scale = Math.min(1, 1280 / maxSide)
    const w = Math.max(1, Math.round(img.width * scale))
    const h = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return dataUrl
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', 0.85)
  } catch {
    return dataUrl
  }
}

export default function PhotoPrompt() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string>('')
  const [hint, setHint] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(0)
  const [result, setResult] = useState<PhotoAnalysis | null>(null)
  const [copied, setCopied] = useState<'prompt' | 'negative' | 'tags' | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const stepRef = useRef(0)

  function pickFile(f: File | null | undefined) {
    if (!f) return
    if (!f.type.startsWith('image/')) {
      toast.error('That is not an image file. Use PNG, JPG, WEBP or GIF.')
      return
    }
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`The photo is too large (max ${MAX_FILE_MB} MB).`)
      return
    }
    setFile(f)
    setResult(null)
    setPreview(URL.createObjectURL(f))
  }

  useEffect(() => {
    if (loading) {
      setStep(0)
      stepRef.current = 0
      stepTimer.current = setInterval(() => {
        stepRef.current = Math.min(stepRef.current + 1, LOADING_STEPS.length - 1)
        setStep(stepRef.current)
      }, 4500)
    } else if (stepTimer.current) {
      clearInterval(stepTimer.current)
      stepTimer.current = null
    }
    return () => {
      if (stepTimer.current) clearInterval(stepTimer.current)
    }
  }, [loading])

  function clearAll() {
    setFile(null)
    setPreview('')
    setResult(null)
    setHint('')
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleGenerate() {
    if (!file) {
      toast.error('Choose a photo first.')
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const dataUrl = await fileToDataUrl(file)
      const res = await fetch('/api/photo-prompt', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: dataUrl, hint: hint.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        toast.error(data.error || 'The AI analysis failed.')
        return
      }
      setResult(data)
    } catch {
      toast.error('A network error occurred — check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  async function copyText(text: string, kind: 'prompt' | 'negative' | 'tags') {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      toast.success(
        kind === 'prompt' ? 'Prompt copied!' : kind === 'negative' ? 'Negative prompt copied!' : 'Tags copied!'
      )
      setTimeout(() => setCopied(null), 2000)
    } catch {
      toast.error('Could not copy — please select the text manually.')
    }
  }

  return (
    <div className="w-full">
      {/* ------------------------------ upload zone ------------------------------ */}
      <div className="mx-auto w-full max-w-2xl">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            pickFile(e.dataTransfer.files?.[0])
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
          }}
          aria-label="Upload a photo"
          className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-6 sm:p-8 text-center transition-all ${
            dragging
              ? 'border-fuchsia-400/70 bg-fuchsia-400/10'
              : 'border-white/15 bg-white/[0.03] hover:border-violet-400/50 hover:bg-white/[0.05]'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />

          {preview ? (
            <div className="flex flex-col sm:flex-row items-center gap-4 text-left">
              <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-white/10">
                <img src={preview} alt="Selected photo preview" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    clearAll()
                  }}
                  aria-label="Remove photo"
                  className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-zinc-200 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-zinc-100">{file?.name}</p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Click or drop another photo to replace it
                </p>
              </div>
            </div>
          ) : (
            <>
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/20 via-fuchsia-500/15 to-cyan-400/15 border border-white/10">
                <ImagePlus className="h-7 w-7 text-violet-300" />
              </span>
              <p className="mt-4 text-sm font-bold text-zinc-100">
                Drop a photo here, or <span className="text-gradient">click to browse</span>
              </p>
              <p className="mt-1.5 text-[11px] text-zinc-500">
                PNG / JPG / WEBP / GIF — up to {MAX_FILE_MB} MB
              </p>
            </>
          )}
        </div>

        {/* hint + generate */}
        <div className="mt-4 flex flex-col sm:flex-row gap-2.5">
          <input
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="Optional: what should the prompt focus on?"
            aria-label="Optional focus hint"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-fuchsia-400/50 transition-colors"
          />
          <button
            onClick={handleGenerate}
            disabled={loading || !file}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-violet-500 bg-[length:200%_100%] hover:bg-right px-6 py-3 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Generating...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" /> Generate Prompt
              </>
            )}
          </button>
        </div>
        <p className="mt-3 text-center text-[11px] text-zinc-500">
          Ready for Midjourney / DALL-E / Flux / Stable Diffusion prompts
        </p>
      </div>

      {/* ------------------------------ loading card ------------------------------ */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="mx-auto mt-8 w-full max-w-2xl"
          >
            <div className="rounded-3xl glass p-6">
              <div className="flex items-center gap-3">
                <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/20 to-fuchsia-500/20 border border-fuchsia-400/20">
                  <Sparkles className="h-5 w-5 text-fuchsia-300 animate-pulse" />
                </span>
                <p className="text-sm font-bold text-zinc-100">{LOADING_STEPS[step]}</p>
              </div>
              <div className="mt-4 space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-3 rounded-full shimmer" style={{ width: `${88 - i * 16}%` }} />
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
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="mx-auto mt-8 w-full max-w-3xl scroll-mt-24"
          >
            <div className="overflow-hidden rounded-3xl glass ring-glow">
              <div className="flex items-center gap-4 border-b border-white/8 p-5 sm:p-6">
                {preview ? (
                  <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-zinc-800">
                    <img src={preview} alt="" className="h-full w-full object-cover" />
                  </div>
                ) : null}
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm sm:text-base font-bold text-zinc-50">
                    Photo → Prompt
                  </h3>
                  <span className="mt-1 flex items-center gap-1 text-[11px] text-fuchsia-300">
                    <Sparkles className="h-3 w-3" /> AI Generated Prompt
                  </span>
                </div>
                <button
                  onClick={handleGenerate}
                  disabled={loading}
                  aria-label="Regenerate prompt"
                  className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-2.5 text-zinc-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="p-5 sm:p-6 space-y-6">
                {/* main prompt */}
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-fuchsia-300">
                      <Wand2 className="h-3.5 w-3.5" /> AI Image Prompt
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

                {/* negative prompt */}
                {result.negativePrompt && (
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] font-bold uppercase tracking-widest text-rose-300">
                        Negative Prompt
                      </p>
                      <button
                        onClick={() => copyText(result.negativePrompt, 'negative')}
                        className="flex items-center gap-1.5 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-1.5 text-xs font-bold text-rose-200 transition-colors hover:bg-rose-400/20 min-h-[32px]"
                      >
                        {copied === 'negative' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        Copy
                      </button>
                    </div>
                    <div className="mt-3 rounded-2xl border border-rose-400/15 bg-rose-500/[0.05] p-4">
                      <p className="text-xs leading-relaxed text-zinc-300">{result.negativePrompt}</p>
                    </div>
                  </div>
                )}

                {/* description */}
                {result.description && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-cyan-300">
                      What this photo shows
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
