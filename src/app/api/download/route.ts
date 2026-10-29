import fs from 'fs'
import { Readable } from 'stream'
import {
  detectPlatform,
  fetchInfoResilient,
  runYtDlp,
  ytDlpArgs,
  makeWorkDir,
  sweepWorkDirs,
  findMediaFile,
  sanitizeFilename,
  rateLimit,
  clientIp,
  tikwmResolve,
  tikwmMediaUrl,
  BROWSER_UA,
  type Platform,
} from '@/lib/video'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* ---- simple concurrency guard -------------------------------------- */
let activeDownloads = 0
const MAX_ACTIVE = 3

function jsonErr(error: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function contentHeader(ext: string): string {
  switch (ext) {
    case 'mp4':
      return 'video/mp4'
    case 'mp3':
      return 'audio/mpeg'
    case 'm4a':
      return 'audio/mp4'
    case 'webm':
      return 'video/webm'
    default:
      return 'application/octet-stream'
  }
}

function dispositionFor(title: string, tag: string, ext: string): string {
  const safeAscii =
    title.replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'download'
  const filename = `${title} [${tag}].${ext}`
  return `attachment; filename="${safeAscii}.${ext}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

/** Stream a remote media URL (tikwm CDN) through this server. */
async function streamRemote(
  mediaUrl: string,
  title: string,
  tag: string,
  ext: string
): Promise<Response> {
  const upstream = await fetch(mediaUrl, {
    headers: { 'user-agent': BROWSER_UA, referer: 'https://www.tiktok.com/' },
    signal: AbortSignal.timeout(10 * 60_000),
    cache: 'no-store',
  })
  if (!upstream.ok || !upstream.body) {
    return jsonErr('Could not fetch the media file — please try again.', 502)
  }
  const headers: Record<string, string> = {
    'content-type': contentHeader(ext),
    'content-disposition': dispositionFor(title, tag, ext),
    'cache-control': 'no-store',
  }
  const len = upstream.headers.get('content-length')
  if (len) headers['content-length'] = len
  return new Response(upstream.body, { headers })
}

export async function GET(req: Request) {
  sweepWorkDirs()

  if (!rateLimit(`dl:${clientIp(req)}`, 12, 60_000)) {
    return jsonErr('Too many download requests — please try again in 60 seconds.', 429)
  }
  if (activeDownloads >= MAX_ACTIVE) {
    return jsonErr('The server is busy right now — please retry in a few seconds.', 503)
  }

  const { searchParams } = new URL(req.url)
  const url = (searchParams.get('url') || '').trim()
  const mode = searchParams.get('mode') === 'audio' ? 'audio' : 'video'
  const audioKey = searchParams.get('audio') === 'original' ? 'original' : 'mp3'
  const engine = searchParams.get('engine') === 'tikwm' ? 'tikwm' : 'ytdlp'
  const height = Math.max(
    144,
    Math.min(2160, parseInt(searchParams.get('height') || '1080', 10) || 1080)
  )

  if (!url) return jsonErr('A link is required.')
  const platform: Platform | null = detectPlatform(url)
  if (!platform) return jsonErr('Unsupported link.')

  /* ---- TikTok direct-stream path (tikwm engine) ----------------------- */
  if (platform === 'tiktok' && engine === 'tikwm') {
    try {
      const data = await tikwmResolve(url)
      const media = tikwmMediaUrl(data, mode, height)
      if (!media) return jsonErr('That quality is not available right now — try another one.', 422)
      const title = sanitizeFilename(data.title || 'tiktok-video', 'tiktok-video')
      return await streamRemote(
        media,
        title,
        mode === 'video' ? (height >= 1080 ? '1080p' : '720p') : 'MP3',
        mode === 'video' ? 'mp4' : 'mp3'
      )
    } catch (e) {
      return jsonErr('The TikTok download failed — please try again shortly.', 502)
    }
  }

  /* ---- resolve current formats (yt-dlp, resilient) ---------------------- */
  let info
  try {
    const r = await fetchInfoResilient(url, platform)
    if (!r.info) throw new Error(r.error || 'resolve failed')
    info = r.info
  } catch (e) {
    /* TikTok auto-fallback to tikwm engine */
    if (platform === 'tiktok') {
      try {
        const data = await tikwmResolve(url)
        const media = tikwmMediaUrl(data, mode, height)
        if (!media) return jsonErr('That quality is not available right now.', 422)
        const title = sanitizeFilename(data.title || 'tiktok-video', 'tiktok-video')
        return await streamRemote(
          media,
          title,
          mode === 'video' ? (height >= 1080 ? '1080p' : '720p') : 'MP3',
          mode === 'video' ? 'mp4' : 'mp3'
        )
      } catch (twErr) {
        console.error('[api/download] tikwm fallback failed:', twErr)
      }
    }
    const msg = (e as Error & { stderr?: string }).stderr || (e as Error).message || ''
    return jsonErr('Could not resolve the video: ' + msg.slice(-160), 422)
  }

  const title = sanitizeFilename(info.title || 'video', 'video')

  /* ---- build yt-dlp args --------------------------------------------- */
  const dir = makeWorkDir()
  let formatSelector: string
  let outExt: string
  const common = ['-o', `${dir}/vid.%(ext)s`]

  if (mode === 'video') {
    formatSelector =
      `bv*[vcodec^=avc1][height<=${height}]+ba[ext=m4a]/` +
      `bv*[ext=mp4][height<=${height}]+ba[ext=m4a]/` +
      `bv*[height<=${height}]+ba/` +
      `b[height<=${height}]/b`
    outExt = 'mp4'
  } else if (audioKey === 'mp3') {
    formatSelector = 'ba/b'
    common.push('-x', '--audio-format', 'mp3', '--audio-quality', '320K')
    outExt = 'mp3'
  } else {
    formatSelector = 'ba/b'
    outExt = 'm4a'
  }

  const args = ytDlpArgs(['-f', formatSelector, ...common, url])
  if (mode === 'video') args.push('--merge-output-format', 'mp4', '--concurrent-fragments', '4')

  activeDownloads += 1
  try {
    try {
      await runYtDlp(args, 15 * 60_000)
    } catch (e) {
      /* TikTok auto-fallback on yt-dlp failure */
      if (platform === 'tiktok') {
        try {
          const data = await tikwmResolve(url)
          const media = tikwmMediaUrl(data, mode, height)
          if (media) {
            const t2 = sanitizeFilename(data.title || 'tiktok-video', 'tiktok-video')
            return await streamRemote(
              media,
              t2,
              mode === 'video' ? (height >= 1080 ? '1080p' : '720p') : 'MP3',
              mode === 'video' ? 'mp4' : 'mp3'
            )
          }
        } catch (twErr) {
          console.error('[api/download] tikwm fallback failed:', twErr)
        }
      }
      const msg = (e as Error & { stderr?: string }).stderr || (e as Error).message || ''
      return jsonErr('The download failed — ' + msg.slice(-200), 502)
    }

    const file = findMediaFile(dir)
    if (!file || fs.statSync(file).size === 0) {
      return jsonErr('Could not produce the file — please try again.', 500)
    }

    /* ---- stream to client ---------------------------------------------- */
    const stat = fs.statSync(file)
    const ext = (file.split('.').pop() || outExt).toLowerCase()
    const tag = mode === 'video' ? `${height}p` : ext.toUpperCase()

    const nodeStream = fs.createReadStream(file)
    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      try {
        fs.rmSync(dir, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
    nodeStream.on('close', cleanup)
    nodeStream.on('error', cleanup)

    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>

    return new Response(webStream, {
      headers: {
        'content-type': contentHeader(ext),
        'content-length': String(stat.size),
        'content-disposition': dispositionFor(title, tag, ext),
        'cache-control': 'no-store',
      },
    })
  } finally {
    activeDownloads -= 1
  }
}
