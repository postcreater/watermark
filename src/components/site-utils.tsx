import { Youtube, Instagram, Facebook } from 'lucide-react'

export interface QualityOption {
  height: number
  label: string
  badge: string | null
  ext: string
  filesize: number | null
}

export interface AudioOption {
  key: 'mp3' | 'original'
  label: string
  detail: string
  ext: string
  abr: number | null
  filesize: number | null
}

export interface VideoResult {
  ok: true
  engine: 'ytdlp' | 'tikwm'
  platform: 'youtube' | 'tiktok' | 'instagram' | 'facebook'
  platformLabel: string
  sourceUrl: string
  title: string
  author: string
  duration: number | null
  thumbnail: string | null
  watermarkFree: boolean
  qualities: QualityOption[]
  audio: AudioOption[]
}

export interface AnalyzeResult {
  ok: true
  platform: 'youtube' | 'tiktok' | 'instagram' | 'facebook'
  title: string
  thumbnail: string | null
  duration: number | null
  prompt: string
  description: string
  elements: Record<string, string>
  tags: string[]
}

export function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  )
}

export function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  switch (platform) {
    case 'youtube':
      return <Youtube className={className} />
    case 'instagram':
      return <Instagram className={className} />
    case 'facebook':
      return <Facebook className={className} />
    case 'tiktok':
      return <TikTokIcon className={className} />
    default:
      return <Youtube className={className} />
  }
}

/* brand chip colors */
export function platformAccent(platform: string): string {
  switch (platform) {
    case 'youtube':
      return 'bg-red-600'
    case 'tiktok':
      return 'bg-zinc-900 border border-white/20'
    case 'instagram':
      return 'bg-gradient-to-r from-fuchsia-600 to-orange-500'
    case 'facebook':
      return 'bg-[#1877f2]'
    default:
      return 'bg-zinc-800'
  }
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  return `${m}:${String(r).padStart(2, '0')}`
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 MB'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/* ------------------------------------------------------------------ */
/*  Link extraction & validation                                       */
/* ------------------------------------------------------------------ */

const SUPPORTED_URL_RE =
  /^(https?:\/\/)?(?:[a-z0-9-]+\.)*(youtube\.com|youtu\.be|youtube-nocookie\.com|tiktok\.com|instagram\.com|instagr\.am|facebook\.com|fb\.watch|fb\.me|fb\.gg)\/\S+/i

/** Accepts any subdomain: www. m. music. web. mbasic. vm. vt. ... */
export function isSupportedVideoUrl(input: string): boolean {
  return SUPPORTED_URL_RE.test(input.trim())
}

/**
 * Pull a clean video URL out of arbitrary pasted text.
 * Handles: plain links, links wrapped in text, links with trailing
 * punctuation/quotes, and short "youtu.be/xyz" strings without protocol.
 */
export function extractVideoUrl(input: string): string | null {
  const text = (input || '').trim()
  if (!text) return null

  // 1) an explicit http(s) URL anywhere in the text
  const m = text.match(/https?:\/\/[^\s"'<>()]+/i)
  if (m) return cleanUrl(m[0])

  // 2) bare host forms without protocol (youtu.be/xyz, tiktok.com/@user/video/...)
  const bare = text.match(
    /(^|[\s"'<(])((?:[a-z0-9-]+\.)*(?:youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|fb\.watch)\/[^\s"'<>()]+)/i
  )
  if (bare) return cleanUrl(bare[2])

  return null
}

function cleanUrl(u: string): string {
  return u.replace(/[),.;:!?'"\]]+$/g, '').trim()
}
