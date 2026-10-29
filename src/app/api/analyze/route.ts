import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import ZAI from 'z-ai-web-dev-sdk'
import {
  detectPlatform,
  fetchInfoResilient,
  runYtDlp,
  ytDlpArgs,
  makeWorkDir,
  sweepWorkDirs,
  findMediaFile,
  rateLimit,
  clientIp,
  tikwmResolve,
  tikwmMediaUrl,
  BROWSER_UA,
  type Platform,
} from '@/lib/video'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MAX_DURATION_SEC = 180
const COMPRESSED_LIMIT = 14 * 1024 * 1024 // 14 MB after first compression pass

function jsonErr(error: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function run(cmd: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

/** Compress a video into a small analysis copy (no audio). */
async function compressForAnalysis(input: string, outPath: string): Promise<void> {
  await run(
    '/usr/bin/ffmpeg',
    [
      '-y',
      '-i', input,
      '-vf', "scale='min(480,iw)':-2,fps=6",
      '-an',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '32',
      '-movflags', '+faststart',
      outPath,
    ],
    5 * 60_000
  )
}

/** Heavier compression pass for longer videos. */
async function compressHard(input: string, outPath: string): Promise<void> {
  await run(
    '/usr/bin/ffmpeg',
    [
      '-y',
      '-i', input,
      '-vf', "scale='min(360,iw)':-2,fps=4",
      '-an',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '35',
      '-movflags', '+faststart',
      outPath,
    ],
    5 * 60_000
  )
}

interface AnalysisResult {
  prompt: string
  description: string
  elements: Record<string, string>
  tags: string[]
}

const ANALYSIS_PROMPT = `You are an expert AI video prompt engineer. Watch this video carefully and reverse-engineer a production-ready prompt that could recreate a very similar video with an AI video generator (Sora, Google Veo, Kling, Runway, Pika).

Focus on everything that changes over time: subject actions, camera movement, transitions, and pacing — not just a single still moment.

Respond with ONLY valid JSON, no markdown fences, no commentary:
{
  "prompt": "One detailed English paragraph (70-130 words) written as a direct video-generation prompt. Include: main subject + appearance + their actions in sequence, scene/setting details, camera movement and shot type, lighting and color grade, visual style (cinematic / phone video / anime etc.), and overall mood.",
  "description": "A 2-3 sentence plain summary of what literally happens in the video from start to end.",
  "elements": {
    "subject": "who or what is in the video",
    "scene": "where it takes place",
    "action": "the main actions/movements in order",
    "camera": "shot type + camera movement",
    "lighting": "lighting + color grade",
    "style": "visual style/aesthetic",
    "mood": "the mood/vibe"
  },
  "tags": ["8 to 12 short lowercase keywords"]
}`

function parseAnalysis(raw: string): AnalysisResult {
  let text = (raw || '').trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) text = fence[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) text = text.slice(start, end + 1)
  const j = JSON.parse(text) as AnalysisResult
  if (!j.prompt) throw new Error('missing prompt field')
  return {
    prompt: String(j.prompt),
    description: String(j.description || ''),
    elements: j.elements && typeof j.elements === 'object' ? j.elements : {},
    tags: Array.isArray(j.tags) ? j.tags.map(String).slice(0, 14) : [],
  }
}

let activeAnalyzes = 0
const MAX_ACTIVE_ANALYZE = 2

export async function POST(req: Request) {
  sweepWorkDirs()

  if (!rateLimit(`analyze:${clientIp(req)}`, 8, 60_000)) {
    return jsonErr('Too many analyze requests — please try again in 60 seconds.', 429)
  }
  if (activeAnalyzes >= MAX_ACTIVE_ANALYZE) {
    return jsonErr('The AI analyzer is busy right now — please retry in a few seconds.', 503)
  }

  const body = await req.json().catch(() => null)
  const url = typeof body?.url === 'string' ? body.url.trim() : ''
  if (!url) return jsonErr('Please paste a link first.')

  const platform: Platform | null = detectPlatform(url)
  if (!platform) {
    return jsonErr('Unsupported link. Please paste a YouTube, TikTok, Instagram or Facebook link.')
  }

  /* ---- resolve metadata first (duration guard) ------------------------- */
  let title = 'video'
  let thumbnail: string | null = null
  let duration = 0

  const meta = await fetchInfoResilient(url, platform)
  if (meta.info) {
    title = meta.info.title || title
    thumbnail = meta.info.thumbnail || null
    duration = typeof meta.info.duration === 'number' ? meta.info.duration : 0
  } else if (platform === 'tiktok') {
    try {
      const d = await tikwmResolve(url)
      title = d.title || title
      thumbnail = d.cover || null
      duration = typeof d.duration === 'number' ? d.duration : 0
    } catch {
      /* ignore — flow continues, download step will surface errors */
    }
  }

  if (duration > MAX_DURATION_SEC) {
    return jsonErr(
      `This video is too long (${Math.round(duration)}s). AI analysis works for videos under ${MAX_DURATION_SEC / 60} minutes.`,
      422
    )
  }

  /* ---- download a copy of the video ------------------------------------ */
  const dir = makeWorkDir()
  activeAnalyzes += 1
  try {
    let sourceFile: string | null = null

    if (platform === 'tiktok') {
      // fastest path: tikwm direct URL (works even when yt-dlp is blocked)
      try {
        const data = await tikwmResolve(url)
        const media = tikwmMediaUrl(data, 'video', 720)
        if (media) {
          const res = await fetch(media, {
            headers: { 'user-agent': BROWSER_UA, referer: 'https://www.tiktok.com/' },
            signal: AbortSignal.timeout(120_000),
          })
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer())
            sourceFile = path.join(dir, 'source.mp4')
            fs.writeFileSync(sourceFile, buf)
          }
        }
      } catch {
        /* fall through to yt-dlp */
      }
    }

    if (!sourceFile) {
      try {
        const args = ytDlpArgs([
          '-f', 'b[height<=480]/bv*[height<=480]+ba/bv*+ba/b',
          '-S', '+size',
          '--merge-output-format', 'mp4',
          '-o', `${dir}/source.%(ext)s`,
          url,
        ])
        await runYtDlp(args, 5 * 60_000)
        sourceFile = findMediaFile(dir)
      } catch {
        /* handled below */
      }
      // one retry with an alternate YouTube player client (bot-checks are flaky per-request)
      if (!sourceFile && platform === 'youtube') {
        await new Promise((r) => setTimeout(r, 1500))
        try {
          const args2 = ytDlpArgs([
            '-f', 'b[height<=480]/bv*[height<=480]+ba/bv*+ba/b',
            '-S', '+size',
            '--merge-output-format', 'mp4',
            '--extractor-args', 'youtube:player_client=android,tv',
            '-o', `${dir}/source.%(ext)s`,
            url,
          ])
          await runYtDlp(args2, 5 * 60_000)
          sourceFile = findMediaFile(dir)
        } catch {
          /* fall through to error */
        }
      }
    }

    if (!sourceFile || !fs.existsSync(sourceFile) || fs.statSync(sourceFile).size === 0) {
      return jsonErr(
        platform === 'youtube'
          ? 'Could not grab the video from YouTube right now (bot-check) — please try again shortly.'
          : 'Could not fetch the video file — please try again.',
        422
      )
    }

    /* ---- compress to a small analysis copy ------------------------------ */
    const small = path.join(dir, 'small.mp4')
    await compressForAnalysis(sourceFile, small)
    if (!fs.existsSync(small) || fs.statSync(small).size === 0) {
      return jsonErr('Could not process the video.', 500)
    }
    if (fs.statSync(small).size > COMPRESSED_LIMIT) {
      await compressHard(sourceFile, small)
    }
    if (fs.statSync(small).size > 22 * 1024 * 1024) {
      return jsonErr('The video is too large for AI analysis — please try a shorter one.', 422)
    }

    /* ---- AI analysis ----------------------------------------------------- */
    const b64 = fs.readFileSync(small).toString('base64')
    const zai = await ZAI.create()
    const res = await zai.chat.completions.createVision({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: ANALYSIS_PROMPT },
            { type: 'video_url', video_url: { url: `data:video/mp4;base64,${b64}` } },
          ],
        },
      ],
      thinking: { type: 'disabled' },
    })
    const raw = res.choices[0]?.message?.content || ''
    let analysis: AnalysisResult
    try {
      analysis = parseAnalysis(raw)
    } catch {
      // model returned non-JSON — still useful, wrap it
      analysis = { prompt: raw.trim() || 'Analysis failed', description: '', elements: {}, tags: [] }
    }

    return Response.json({
      ok: true,
      platform,
      title,
      thumbnail,
      duration,
      ...analysis,
    })
  } catch (err) {
    console.error('[api/analyze] error:', err)
    return jsonErr('AI analysis failed — please try again shortly.', 500)
  } finally {
    activeAnalyzes -= 1
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}
