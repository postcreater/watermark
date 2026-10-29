import ZAI from 'z-ai-web-dev-sdk'
import fs from 'fs'

async function main() {
  const raw = fs.readFileSync('/home/z/my-project/.tmp-test/test.mp4')
  const b64 = raw.toString('base64')
  console.log('video size b64 MB:', Math.round((b64.length / 1024 / 1024) * 10) / 10)

  const zai = await ZAI.create()
  const t0 = Date.now()
  const res = await zai.chat.completions.createVision({
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Describe this video in 2 sentences, then list 5 keywords. Reply in English.',
          },
          {
            type: 'video_url',
            video_url: { url: `data:video/mp4;base64,${b64}` },
          },
        ],
      },
    ],
    thinking: { type: 'disabled' },
  })
  console.log('elapsed s:', Math.round((Date.now() - t0) / 1000))
  console.log(res.choices[0]?.message?.content)
}

main().catch((e) => {
  console.error('FAILED:', e?.message || e)
  process.exit(1)
})
