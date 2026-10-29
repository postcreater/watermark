import { rateLimit, clientIp } from '@/lib/video'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* CDN hosts we allow the proxy to fetch from */
const IMG_HOST_SUFFIXES = [
  'ytimg.com',
  'cdninstagram.com',
  'fbcdn.net',
  'tiktokcdn.com',
  'tiktokcdn-us.com',
  'tiktokcdn-eu.com',
  'tiktokv.com',
  'byteoversea.com',
  'ibyteimg.com',
  'muscdn.com',
  'akamaized.net',
  'snapshoot.com',
]

function allowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return IMG_HOST_SUFFIXES.some((s) => h === s || h.endsWith('.' + s))
}

export async function GET(req: Request) {
  if (!rateLimit(`thumb:${clientIp(req)}`, 120, 60_000)) {
    return new Response('Too many requests', { status: 429 })
  }

  const { searchParams } = new URL(req.url)
  const raw = searchParams.get('u') || ''
  let target: URL
  try {
    target = new URL(raw)
  } catch {
    return new Response('Bad url', { status: 400 })
  }
  if (target.protocol !== 'https:' || !allowedHost(target.hostname)) {
    return new Response('Host not allowed', { status: 403 })
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        referer: target.origin + '/',
      },
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    })
    if (!upstream.ok || !upstream.body) {
      return new Response('Upstream error', { status: 502 })
    }
    const contentType = upstream.headers.get('content-type') || 'image/jpeg'
    if (!contentType.startsWith('image/')) {
      return new Response('Not an image', { status: 415 })
    }
    const buf = await upstream.arrayBuffer()
    return new Response(buf, {
      headers: {
        'content-type': contentType,
        'cache-control': 'public, max-age=1800',
      },
    })
  } catch {
    return new Response('Fetch failed', { status: 502 })
  }
}
