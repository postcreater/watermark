import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

/* ------------------------------------------------------------------ */
/*  yt-dlp / ffmpeg binary resolution                                  */
/* ------------------------------------------------------------------ */

const YTDLP_CANDIDATES = [
  '/home/z/.venv/bin/yt-dlp',
  '/usr/local/bin/yt-dlp',
  '/usr/bin/yt-dlp',
]

export const FFMPEG_PATH = '/usr/bin/ffmpeg'

let cachedYtDlp: string | null = null

export function findYtDlp(): string | null {
  if (cachedYtDlp) return cachedYtDlp
  for (const p of YTDLP_CANDIDATES) {
    try {
      if (fs.existsSync(p)) {
        cachedYtDlp = p
        return p
      }
    } catch {
      /* ignore */
    }
  }
  return null
}

/* ------------------------------------------------------------------ */
/*  Supported platforms                                                */
/* ------------------------------------------------------------------ */

export type Platform = 'youtube' | 'tiktok' | 'instagram' | 'facebook'

const HOST_RULES: Array<{ platform: Platform; suffixes: string[] }> = [
  {
    platform: 'youtube',
    suffixes: ['youtube.com', 'youtu.be', 'youtube-nocookie.com', 'm.youtube.com', 'music.youtube.com'],
  },
  {
    platform: 'tiktok',
    suffixes: ['tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'],
  },
  {
    platform: 'instagram',
    suffixes: ['instagram.com', 'instagr.am', 'ddinstagram.com'],
  },
  {
    platform: 'facebook',
    suffixes: ['facebook.com', 'fb.watch', 'fb.gg', 'fb.me'],
  },
]

export function detectPlatform(rawUrl: string): Platform | null {
  let host: string
  try {
    const u = new URL(rawUrl)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    host = u.hostname.toLowerCase()
  } catch {
    return null
  }
  for (const rule of HOST_RULES) {
    for (const suffix of rule.suffixes) {
      if (host === suffix || host.endsWith('.' + suffix)) return rule.platform
    }
  }
  return null
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
}

/* ------------------------------------------------------------------ */
/*  Simple in-memory rate limiter                                      */
/* ------------------------------------------------------------------ */

const buckets = new Map<string, { count: number; resetAt: number }>()

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (b.count >= limit) return false
  b.count += 1
  return true
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'local'
}

/* ------------------------------------------------------------------ */
/*  yt-dlp JSON info extraction                                        */
/* ------------------------------------------------------------------ */

export interface RawFormat {
  format_id?: string
  ext?: string
  height?: number | null
  width?: number | null
  vcodec?: string
  acodec?: string
  tbr?: number | null
  abr?: number | null
  filesize?: number | null
  filesize_approx?: number | null
}

export interface VideoInfo {
  id?: string
  title?: string
  thumbnail?: string
  duration?: number | null
  uploader?: string | null
  channel?: string | null
  formats?: RawFormat[]
  webpage_url?: string
  extractor_key?: string
  _type?: string
  entries?: VideoInfo[]
  is_live?: boolean
}

export function ytDlpArgs(extra: string[]): string[] {
  const base = [
    '--no-warnings',
    '--no-playlist',
    '--no-progress',
    '--ignore-config',
    '--no-check-certificate',
    '--socket-timeout',
    '15',
    '--retries',
    '3',
    '--ffmpeg-location',
    FFMPEG_PATH,
    '--user-agent',
    BROWSER_UA,
  ]
  return [...base, ...extra]
}

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

/* ------------------------------------------------------------------ */
/*  TikTok fallback engine (tikwm) — used when TikTok blocks yt-dlp    */
/* ------------------------------------------------------------------ */

export interface TikwmData {
  id?: string
  title?: string
  cover?: string
  duration?: number
  play?: string
  hdplay?: string
  size?: number | string
  hd_size?: number | string
  music?: string
  music_info?: { play?: string; title?: string; duration?: number }
  author?: { nickname?: string; unique_id?: string }
}

export async function tikwmResolve(sourceUrl: string): Promise<TikwmData> {
  const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(sourceUrl)}&hd=1`
  const res = await fetch(api, {
    headers: { 'user-agent': BROWSER_UA, accept: 'application/json' },
    signal: AbortSignal.timeout(25_000),
    cache: 'no-store',
  })
  const j = (await res.json()) as { code?: number; msg?: string; data?: TikwmData }
  if (!res.ok || j.code !== 0 || !j.data || (!j.data.play && !j.data.hdplay)) {
    throw new Error('tikwm failed: ' + (j.msg || res.status))
  }
  return j.data
}

/** Build the absolute media URL for the requested tikwm asset. */
export function tikwmMediaUrl(data: TikwmData, mode: 'video' | 'audio', height: number): string {
  const abs = (u?: string) => {
    if (!u) return null
    if (u.startsWith('http')) return u
    if (u.startsWith('/')) return 'https://www.tikwm.com' + u
    return 'https://www.tikwm.com/' + u
  }
  if (mode === 'audio') {
    return abs(data.music_info?.play || data.music)
  }
  if (height >= 1080) return abs(data.hdplay || data.play)
  return abs(data.play || data.hdplay)
}

function toBytes(v: number | string | undefined): number | null {
  if (typeof v === 'number' && v > 0) return Math.round(v)
  if (typeof v === 'string') {
    const n = parseFloat(v)
    if (!isNaN(n)) {
      if (/gb/i.test(v)) return Math.round(n * 1024 * 1024 * 1024)
      if (/mb/i.test(v)) return Math.round(n * 1024 * 1024)
      if (/kb/i.test(v)) return Math.round(n * 1024)
      return Math.round(n)
    }
  }
  return null
}

export function tikwmQualities(data: TikwmData): QualityOption[] {
  const out: QualityOption[] = []
  if (data.hdplay) {
    out.push({ height: 1080, label: '1080p', badge: 'HD', ext: 'mp4', filesize: toBytes(data.hd_size) })
  }
  if (data.play) {
    out.push({ height: 720, label: '720p', badge: null, ext: 'mp4', filesize: toBytes(data.size) })
  }
  return out
}

export function runYtDlp(
  args: string[],
  timeoutMs: number
): Promise<{ stdout: string; stderr: string }> {
  const bin = findYtDlp()
  if (!bin) {
    return Promise.reject(new Error('yt-dlp binary not found on server'))
  }
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        if (err && !stdout) {
          const e = new Error(stderr?.toString().slice(-2000) || err.message)
          ;(e as NodeJS.ErrnoException & { stderr?: string }).stderr = stderr?.toString()
          reject(e)
        } else {
          resolve({ stdout: stdout.toString(), stderr: stderr?.toString() || '' })
        }
      }
    )
  })
}

export async function fetchInfo(url: string): Promise<VideoInfo> {
  const { stdout } = await runYtDlp(ytDlpArgs(['-J', url]), 60_000)
  const data = JSON.parse(stdout) as VideoInfo
  // Playlists / multi-entry: take the first video entry
  if (data._type === 'playlist' && Array.isArray(data.entries) && data.entries.length > 0) {
    return { ...data.entries[0], webpage_url: data.entries[0].webpage_url || url }
  }
  return data
}

/**
 * Resilient info fetch:
 *  1. plain extraction
 *  2. YouTube: retry with alternate player clients (beats flaky bot-checks)
 *  3. any platform: one plain retry (transient network errors)
 * Returns the info, or the raw error text of the last attempt.
 */
export async function fetchInfoResilient(
  url: string,
  platform: Platform | null
): Promise<{ info: VideoInfo | null; error: string }> {
  let lastError = ''
  const attempts: Array<{ url: string; extra?: string[] }> = [{ url }]

  if (platform === 'youtube') {
    attempts.push({ url, extra: ['--extractor-args', 'youtube:player_client=android,tv'] })
    attempts.push({ url, extra: ['--extractor-args', 'youtube:player_client=ios'] })
    attempts.push({ url, extra: ['--extractor-args', 'youtube:player_client=web_embedded,mweb'] })
  }

  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i]
    try {
      const info = await fetchInfo(a.url)
      if (info) return { info, error: '' }
    } catch (e) {
      lastError =
        (e as Error & { stderr?: string }).stderr || (e as Error).message || String(e)
    }
    if (i < attempts.length - 1) await new Promise((r) => setTimeout(r, 900))
  }

  // one generic retry for non-YouTube platforms (transient failures)
  if (platform !== 'youtube') {
    await new Promise((r) => setTimeout(r, 1200))
    try {
      const info = await fetchInfo(url)
      if (info) return { info, error: '' }
    } catch (e) {
      lastError =
        (e as Error & { stderr?: string }).stderr || (e as Error).message || lastError
    }
  }
  return { info: null, error: lastError }
}

/* ------------------------------------------------------------------ */
/*  Quality option building                                            */
/* ------------------------------------------------------------------ */

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

const BADGES: Record<number, string> = {
  2160: '4K Ultra HD',
  1440: '2K QHD',
  1080: 'Full HD',
  720: 'HD',
  480: 'SD',
}

const INTERESTING_HEIGHTS = [2160, 1440, 1080, 720, 480, 360, 240, 144]

function fmtSize(bytes: number | null | undefined): number | null {
  if (!bytes || bytes <= 0) return null
  return Math.round(bytes)
}

export function buildQualities(info: VideoInfo): QualityOption[] {
  const formats = (info.formats || []).filter(
    (f) => f.vcodec && f.vcodec !== 'none' && f.height && f.height > 0
  )
  if (formats.length === 0) return []

  const bestAudio = bestAudioFormat(info)
  const audioSize = fmtSize(bestAudio?.filesize ?? bestAudio?.filesize_approx)

  const byHeight = new Map<number, RawFormat>()
  for (const f of formats) {
    const h = f.height as number
    const prev = byHeight.get(h)
    if (!prev || (f.tbr || 0) > (prev.tbr || 0)) {
      byHeight.set(h, f)
    }
  }

  const heights = INTERESTING_HEIGHTS.filter((h) => byHeight.has(h))
  if (heights.length === 0) {
    // fall back: use whatever heights exist
    heights.push(...[...byHeight.keys()].sort((a, b) => b - a).slice(0, 4))
  }

  const out: QualityOption[] = []
  const duration = typeof info.duration === 'number' ? info.duration : 0
  for (const h of heights) {
    const f = byHeight.get(h) as RawFormat
    let own = fmtSize(f.filesize ?? f.filesize_approx)
    // estimate from bitrate when the platform hides file sizes (e.g. YouTube DASH)
    if (!own && f.tbr && duration > 0) {
      own = Math.round((f.tbr * 1000 * duration) / 8)
    }
    // merged estimate = video part + audio part (only when the picked format is video-only)
    const isVideoOnly = !f.acodec || f.acodec === 'none'
    const total = own ? (isVideoOnly && audioSize ? own + audioSize : own) : null
    out.push({
      height: h,
      label: `${h}p`,
      badge: BADGES[h] || null,
      ext: (f.ext || 'mp4').toLowerCase(),
      filesize: total,
    })
  }
  return out.sort((a, b) => b.height - a.height)
}

export function bestAudioFormat(info: VideoInfo): RawFormat | null {
  const audios = (info.formats || []).filter(
    (f) => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none')
  )
  if (audios.length === 0) {
    // Some sites only expose progressive formats with both streams
    const any = (info.formats || []).filter((f) => f.acodec && f.acodec !== 'none')
    if (any.length === 0) return null
    return any.sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0))[0]
  }
  return audios.sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0))[0]
}

export function buildAudioOptions(info: VideoInfo): AudioOption[] {
  const best = bestAudioFormat(info)
  if (!best) return []
  const originalExt = (best.ext || 'm4a').toLowerCase()
  const size = fmtSize(best.filesize ?? best.filesize_approx)
  const abr = best.abr ? Math.round(best.abr) : null
  const options: AudioOption[] = [
    {
      key: 'mp3',
      label: 'MP3 320kbps',
      detail: 'Plays on any device',
      ext: 'mp3',
      abr: 320,
      filesize: null,
    },
  ]
  options.push({
    key: 'original',
    label: `Original Audio (${originalExt.toUpperCase()})`,
    detail: 'Original stream with zero quality loss',
    ext: originalExt,
    abr: abr,
    filesize: size,
  })
  return options
}

/* ------------------------------------------------------------------ */
/*  Temp download workspace                                            */
/* ------------------------------------------------------------------ */

export const TEMP_ROOT = '/home/z/my-project/.tmp-downloads'

export function makeWorkDir(): string {
  fs.mkdirSync(TEMP_ROOT, { recursive: true })
  const dir = path.join(TEMP_ROOT, crypto.randomUUID())
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** Remove stale work dirs (older than 45 min) — best effort. */
export function sweepWorkDirs(): void {
  try {
    if (!fs.existsSync(TEMP_ROOT)) return
    const cutoff = Date.now() - 45 * 60 * 1000
    for (const name of fs.readdirSync(TEMP_ROOT)) {
      const full = path.join(TEMP_ROOT, name)
      try {
        const st = fs.statSync(full)
        if (st.mtimeMs < cutoff) fs.rmSync(full, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

/** Find the single produced media file inside a work dir. */
export function findMediaFile(dir: string): string | null {
  const skip = ['.part', '.ytdl']
  const files = fs
    .readdirSync(dir)
    .filter((f) => !f.startsWith('.') && !skip.some((s) => f.endsWith(s)))
  if (files.length === 0) return null
  // prefer largest file (merged output)
  return files
    .map((f) => path.join(dir, f))
    .sort((a, b) => {
      try {
        return fs.statSync(b).size - fs.statSync(a).size
      } catch {
        return 0
      }
    })[0]
}

export function sanitizeFilename(name: string, fallback: string): string {
  const cleaned = (name || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return cleaned || fallback
}

export function humanError(raw: string, platform: Platform | null): string {
  const s = (raw || '').toLowerCase()
  const isFbOrIg = platform === 'instagram' || platform === 'facebook'
  if (s.includes('login') || s.includes('cookies') || s.includes('authentication') || s.includes('private')) {
    return isFbOrIg
      ? 'This ' + platform + ' post is private or requires a login, so it cannot be fetched from our server.'
      : 'This video is private or requires a login — it cannot be downloaded.'
  }
  if (s.includes('age') && s.includes('restrict')) {
    return 'This video is age-restricted — our service cannot access it.'
  }
  if (s.includes('geo') || s.includes('not available in your country')) {
    return 'This video is geo-restricted and not available from our server location.'
  }
  if (s.includes('unsupported url')) {
    return 'Unsupported link. Please paste a YouTube / TikTok / Instagram / Facebook video link.'
  }
  if (s.includes('429') || s.includes('too many requests') || s.includes('rate limit')) {
    return 'The platform is rate-limiting us — please try again in a minute.'
  }
  if (s.includes('timed out') || s.includes('timeout') || s.includes('etimedout') || s.includes('econnreset')) {
    return 'The connection was too slow — please try again.'
  }
  if (s.includes('video unavailable') || s.includes('removed') || s.includes('404') || s.includes('cannot parse data')) {
    return 'This video is no longer available (deleted or the link is incomplete).'
  }
  if (s.includes('no video') || s.includes('there is no video')) {
    return 'No video was found on this link.'
  }
  if (s.includes('sign in to confirm') || s.includes('confirm you')) {
    return 'The platform flagged this request as a bot. Please try again in a few seconds.'
  }
  if (isFbOrIg) {
    return 'Could not fetch this ' + platform + ' media. Make sure the post is public, then try again.'
  }
  return 'Could not fetch this video. Double-check the link and try again.'
}
