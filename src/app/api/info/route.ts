import { NextResponse } from 'next/server'
import {
  detectPlatform,
  PLATFORM_LABEL,
  fetchInfoResilient,
  buildQualities,
  buildAudioOptions,
  humanError,
  rateLimit,
  clientIp,
  tikwmResolve,
  tikwmQualities,
  type Platform,
} from '@/lib/video'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    if (!rateLimit(`info:${clientIp(req)}`, 20, 60_000)) {
      return NextResponse.json(
        { ok: false, error: 'Too many requests — please try again in 60 seconds.' },
        { status: 429 }
      )
    }

    const body = await req.json().catch(() => null)
    const url = typeof body?.url === 'string' ? body.url.trim() : ''
    if (!url) {
      return NextResponse.json({ ok: false, error: 'Please paste a link first.' }, { status: 400 })
    }

    const platform = detectPlatform(url)
    if (!platform) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Unsupported link. Please paste a YouTube, TikTok, Instagram or Facebook video link.',
        },
        { status: 400 }
      )
    }

    /* ---- resilient extraction (auto-retries YouTube bot-checks etc.) ----- */
    const { info, error: ytdlpError } = await fetchInfoResilient(url, platform)

    /* ---- TikTok fallback engine (when TikTok blocks direct extraction) ---- */
    if (!info && platform === 'tiktok') {
      try {
        const data = await tikwmResolve(url)
        const audio = data.music_info?.play || data.music
        return NextResponse.json({
          ok: true,
          engine: 'tikwm',
          platform,
          platformLabel: PLATFORM_LABEL[platform],
          sourceUrl: url,
          title: data.title || PLATFORM_LABEL[platform] + ' Video',
          author: data.author?.nickname || data.author?.unique_id || PLATFORM_LABEL[platform],
          duration: typeof data.duration === 'number' ? Math.round(data.duration) : null,
          thumbnail: data.cover || null,
          watermarkFree: true,
          qualities: tikwmQualities(data),
          audio: audio
            ? [
                {
                  key: 'mp3',
                  label: 'Original Sound (MP3)',
                  detail: 'The video sound with zero quality loss',
                  ext: 'mp3',
                  abr: null,
                  filesize: null,
                },
              ]
            : [],
        })
      } catch (twErr) {
        console.error('[api/info] tikwm fallback failed:', twErr)
      }
    }

    if (!info) {
      return NextResponse.json({ ok: false, error: humanError(ytdlpError, platform) }, { status: 422 })
    }

    if (info.is_live) {
      return NextResponse.json(
        { ok: false, error: 'Live streams cannot be downloaded — try again after the stream ends.' },
        { status: 422 }
      )
    }

    const qualities = buildQualities(info)
    const audio = buildAudioOptions(info)

    if (qualities.length === 0 && audio.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'No downloadable video formats found on this link.' },
        { status: 422 }
      )
    }

    const author = info.uploader || info.channel || PLATFORM_LABEL[platform]

    return NextResponse.json({
      ok: true,
      engine: 'ytdlp',
      platform,
      platformLabel: PLATFORM_LABEL[platform],
      sourceUrl: info.webpage_url || url,
      title: info.title || PLATFORM_LABEL[platform] + ' Video',
      author,
      duration: typeof info.duration === 'number' ? Math.round(info.duration) : null,
      thumbnail: info.thumbnail || null,
      // TikTok serves the clean (no-watermark) source; IG/FB never overlay marks on the raw file
      watermarkFree: platform === 'tiktok' || platform === 'instagram' || platform === 'facebook',
      qualities,
      audio,
    })
  } catch (err) {
    console.error('[api/info] unexpected error:', err)
    return NextResponse.json(
      { ok: false, error: 'A server error occurred — please try again later.' },
      { status: 500 }
    )
  }
}
