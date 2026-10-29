import { Download, Sparkles, Music } from 'lucide-react'
import HeroTabs from '@/components/hero-tabs'
import { PlatformIcon } from '@/components/site-utils'

const PLATFORMS = [
  { key: 'youtube', label: 'YouTube', cls: 'hover:border-red-500/50 hover:text-red-400' },
  { key: 'tiktok', label: 'TikTok', cls: 'hover:border-fuchsia-400/50 hover:text-fuchsia-300' },
  { key: 'instagram', label: 'Instagram', cls: 'hover:border-orange-400/50 hover:text-orange-300' },
  { key: 'facebook', label: 'Facebook', cls: 'hover:border-[#1877f2]/60 hover:text-[#5aa4ff]' },
]

export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-x-clip bg-[#07070c]">
      {/* ---------- aurora background ---------- */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="aurora left-[-10%] top-[-15%] h-[420px] w-[420px] bg-violet-600/30" />
        <div
          className="aurora right-[-12%] top-[5%] h-[380px] w-[380px] bg-fuchsia-600/25"
          style={{ animationDelay: '-6s' }}
        />
        <div
          className="aurora bottom-[25%] left-[15%] h-[300px] w-[300px] bg-cyan-500/15"
          style={{ animationDelay: '-11s' }}
        />
        <div
          className="absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            maskImage: 'radial-gradient(ellipse 80% 55% at 50% 0%, black 40%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 55% at 50% 0%, black 40%, transparent 100%)',
          }}
        />
      </div>

      {/* ---------- header ---------- */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#07070c]/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="#" className="flex items-center gap-2.5">
            <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 shadow-lg shadow-fuchsia-500/30">
              <Download className="h-4.5 w-4.5 text-white" strokeWidth={2.6} />
            </span>
            <span className="text-lg font-extrabold tracking-tight text-white">
              Vid<span className="text-gradient">Grab</span>
            </span>
          </a>
          <nav className="hidden items-center gap-7 text-sm font-semibold text-zinc-400 sm:flex">
            <a href="#features" className="transition-colors hover:text-white">Features</a>
            <a href="#tools" className="transition-colors hover:text-white">Tools</a>
          </nav>
          <a
            href="#top"
            className="rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-xs font-bold text-zinc-200 transition-colors hover:bg-white/10"
          >
            100% Free
          </a>
        </div>
      </header>

      {/* ---------- main ---------- */}
      <main id="top" className="relative flex-1">
        {/* hero */}
        <section id="tools" className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
          {/* floating deco cards (lg+) */}
          <div className="pointer-events-none absolute left-6 top-40 hidden xl:block" aria-hidden>
            <div className="floaty rounded-2xl glass p-3 shadow-xl">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-gradient-to-r from-violet-500/30 to-fuchsia-500/30 px-2 py-1 text-[10px] font-extrabold text-violet-200">1080p</span>
                <span className="text-xs font-bold text-zinc-200">Full HD</span>
              </div>
            </div>
          </div>
          <div className="pointer-events-none absolute right-6 top-64 hidden xl:block" aria-hidden>
            <div className="floaty rounded-2xl glass p-3 shadow-xl" style={{ animationDelay: '-2.5s' }}>
              <div className="flex items-center gap-2 text-emerald-300">
                <Music className="h-3.5 w-3.5" />
                <span className="text-xs font-bold">MP3 320kbps</span>
              </div>
            </div>
          </div>

          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-400/10 px-4 py-1.5 text-xs font-bold text-violet-200">
              <Sparkles className="h-3.5 w-3.5" />
              Free • No signup • No watermark
            </div>
            <h1 className="mt-6 text-3xl font-extrabold leading-[1.25] tracking-tight text-white sm:text-5xl sm:leading-[1.2]">
              Download any video{' '}
              <span className="text-gradient">without a watermark</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-zinc-400 sm:text-base">
              TikTok, Instagram, Facebook, YouTube — just paste the link. Download in HD with no
              watermark, extract MP3 audio, or turn any video or photo into an AI prompt. All in
              one place.
            </p>
          </div>

          <div className="mt-10">
            <HeroTabs />
          </div>

          {/* platform chips */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            {PLATFORMS.map((p) => (
              <span
                key={p.key}
                className={`flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-zinc-300 transition-all ${p.cls}`}
              >
                <PlatformIcon platform={p.key} className="h-4 w-4" />
                {p.label}
              </span>
            ))}
          </div>
        </section>

        {/* short feature strip */}
        <section id="features" className="mx-auto max-w-5xl scroll-mt-20 px-4 pb-20 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { t: 'No watermark', d: 'Clean original files — TikTok username overlay removed.' },
              { t: 'HD to 4K', d: '360p, 720p, 1080p, 1440p and 4K when available.' },
              { t: 'MP3 + AI prompts', d: '320kbps audio extraction, plus video/photo → AI prompt.' },
            ].map((f) => (
              <div
                key={f.t}
                className="rounded-2xl border border-white/8 bg-white/[0.02] p-5 text-center transition-colors hover:border-white/15"
              >
                <h3 className="text-sm font-bold text-zinc-50">{f.t}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{f.d}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* ---------- footer ---------- */}
      <footer className="mt-auto border-t border-white/5 bg-black/40">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400">
                <Download className="h-4 w-4 text-white" strokeWidth={2.6} />
              </span>
              <span className="text-base font-extrabold text-white">
                Vid<span className="text-gradient">Grab</span>
              </span>
            </div>
            <nav className="flex items-center gap-6 text-xs font-semibold text-zinc-400">
              <a href="#features" className="hover:text-white">Features</a>
              <a href="#tools" className="hover:text-white">Tools</a>
            </nav>
          </div>
          <p className="mt-8 border-t border-white/5 pt-6 text-center text-[11px] leading-relaxed text-zinc-500">
            © 2026 VidGrab. This tool is for personal use only — do not re-upload copyright-protected
            content. We do not host any videos; all files are fetched directly from platform servers.
            Trademarks belong to their respective owners.
          </p>
        </div>
      </footer>
    </div>
  )
}
