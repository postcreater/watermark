import ZAI from 'z-ai-web-dev-sdk'
import { rateLimit, clientIp } from '@/lib/video'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MAX_BASE64_LENGTH = 16 * 1024 * 1024 // ~12 MB image file after base64
const ALLOWED_MIME = /^data:image\/(png|jpe?g|webp|gif|bmp);base64,/i

function jsonErr(error: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

interface PhotoAnalysis {
  prompt: string
  negativePrompt: string
  description: string
  elements: Record<string, string>
  tags: string[]
}

const PHOTO_PROMPT_INSTRUCTION = `You are an expert AI image prompt engineer. Look at this photo carefully and reverse-engineer a production-ready prompt that could recreate a very similar image with an AI image generator (Midjourney, DALL-E, Flux, Stable Diffusion, Leonardo).

Capture every important visual detail: the main subject and their appearance, pose and expression; the setting and background; camera angle, shot type and lens character; lighting quality, direction and color palette; art style / photographic style; texture and atmosphere; overall mood.

Respond with ONLY valid JSON, no markdown fences, no commentary:
{
  "prompt": "One detailed English paragraph (60-120 words) written as a direct image-generation prompt. Include: main subject + appearance + pose/expression, scene/background details, camera angle and shot type, lighting and color palette, style (photorealistic / cinematic / anime / illustration etc.), atmosphere and mood.",
  "negativePrompt": "A short comma-separated list of things to avoid (e.g. blur, watermark, distorted hands, low quality, extra fingers).",
  "description": "A 1-2 sentence plain summary of what the photo shows.",
  "elements": {
    "subject": "who or what is in the photo",
    "scene": "the location / background / setting",
    "camera": "shot type, angle, lens feel",
    "lighting": "lighting setup + dominant colors",
    "style": "visual style / medium / aesthetic",
    "mood": "the mood / vibe"
  },
  "tags": ["8 to 12 short lowercase keywords"]
}`

function parseAnalysis(raw: string): PhotoAnalysis {
  let text = (raw || '').trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) text = fence[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) text = text.slice(start, end + 1)
  const j = JSON.parse(text) as PhotoAnalysis
  if (!j.prompt) throw new Error('missing prompt field')
  return {
    prompt: String(j.prompt),
    negativePrompt: String(j.negativePrompt || ''),
    description: String(j.description || ''),
    elements: j.elements && typeof j.elements === 'object' ? j.elements : {},
    tags: Array.isArray(j.tags) ? j.tags.map(String).slice(0, 14) : [],
  }
}

let activeJobs = 0
const MAX_ACTIVE = 3

export async function POST(req: Request) {
  if (!rateLimit(`photoPrompt:${clientIp(req)}`, 12, 60_000)) {
    return jsonErr('Too many requests — please try again in 60 seconds.', 429)
  }
  if (activeJobs >= MAX_ACTIVE) {
    return jsonErr('The AI is busy right now — please retry in a few seconds.', 503)
  }

  const body = await req.json().catch(() => null)
  const image: string = typeof body?.image === 'string' ? body.image.trim() : ''
  const hint: string = typeof body?.hint === 'string' ? body.hint.slice(0, 300) : ''

  if (!image) {
    return jsonErr('Please choose a photo first.')
  }
  if (!ALLOWED_MIME.test(image)) {
    return jsonErr('Unsupported image format. Use PNG, JPG, WEBP or GIF.')
  }
  if (image.length > MAX_BASE64_LENGTH) {
    return jsonErr('The photo is too large — please use an image under 12 MB.', 413)
  }

  activeJobs += 1
  try {
    const userText = hint
      ? `Convert this photo into a detailed AI image-generation prompt. Extra note from the user: ${hint}`
      : 'Convert this photo into a detailed AI image-generation prompt.'

    const zai = await ZAI.create()
    const res = await zai.chat.completions.createVision({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PHOTO_PROMPT_INSTRUCTION + '\n\n' + userText },
            { type: 'image_url', image_url: { url: image } },
          ],
        },
      ],
      thinking: { type: 'disabled' },
    })

    const raw = res.choices[0]?.message?.content || ''
    let analysis: PhotoAnalysis
    try {
      analysis = parseAnalysis(raw)
    } catch {
      analysis = {
        prompt: raw.trim() || 'Analysis failed — please try again.',
        negativePrompt: '',
        description: '',
        elements: {},
        tags: [],
      }
    }

    return Response.json({ ok: true, ...analysis })
  } catch (err) {
    console.error('[api/photo-prompt] error:', err)
    return jsonErr('AI analysis failed — please try again shortly.', 500)
  } finally {
    activeJobs -= 1
  }
}
