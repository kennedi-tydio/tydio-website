'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Image from 'next/image'
import { describeDevice, getInstallGuide, type Device, type Platform } from './installGuide'
import s from './InstallDemo.module.css'

// FAQ demo of adding Tydio to the home screen: a phone mockup that plays
// through Tydio's guide, the phone's own add/install screen, and the finished
// home screen, next to the written steps.

type WrittenSteps = { steps: string[]; note?: string }
type Props = { ios: WrittenSteps; android: WrittenSteps }

const DEVICES: Record<Platform, Device> = {
  ios: { platform: 'ios', iosVersion: { major: 26, minor: 0 }, iPad: false, browser: 'safari' },
  android: { platform: 'android', iosVersion: null, iPad: false, browser: 'chrome' },
}

const SCREENS: Record<Platform, { tab: string; caption: string }[]> = {
  ios: [
    { tab: 'Tydio guide', caption: 'Tydio walks you through the steps on your phone.' },
    { tab: 'Add to Home Screen', caption: 'Your iPhone shows this screen. Tap Add.' },
    { tab: 'Home screen', caption: 'Tydio is on your home screen and opens like an app.' },
  ],
  android: [
    { tab: 'Tydio guide', caption: 'In Chrome, tap Install Tydio, or follow the steps in the ⋮ menu.' },
    { tab: 'Install', caption: 'Chrome asks to install the app. Tap Install.' },
    { tab: 'Home screen', caption: 'Tydio is on your home screen and opens like an app.' },
  ],
}

const STEP_MS = 3500

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
function subscribeReducedMotion(callback: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION)
  mq.addEventListener('change', callback)
  return () => mq.removeEventListener('change', callback)
}
function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia(REDUCED_MOTION).matches, () => true)
}
const IOS_ICON = '/icons/apple-touch-icon.png'
const ANDROID_ICON = '/icons/icon-192x192.png'

export default function InstallDemo({ ios, android }: Props) {
  const [platform, setPlatform] = useState<Platform>('ios')
  const [screen, setScreen] = useState(0)
  const reducedMotion = useReducedMotion()
  // null until the person presses Play/Pause or picks a screen.
  const [playChoice, setPlayChoice] = useState<boolean | null>(null)
  const playing = playChoice ?? !reducedMotion
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Only play while on screen (the FAQ answer may be collapsed). People who've
  // asked for reduced motion start paused.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!playing || !visible) return
    const id = setInterval(() => setScreen((n) => (n + 1) % 3), STEP_MS)
    return () => clearInterval(id)
  }, [playing, visible])

  function choosePlatform(p: Platform) {
    setPlatform(p)
    setScreen(0)
  }

  function chooseScreen(n: number) {
    setScreen(n)
    setPlayChoice(false)
  }

  const written = platform === 'ios' ? ios : android
  const screens = SCREENS[platform]

  return (
    <div ref={ref} className="rounded-2xl bg-slate-50 border border-slate-100 p-5">
      <div role="group" aria-label="Phone type" className="inline-flex gap-1 rounded-full bg-slate-200 p-1 mb-5">
        {(['ios', 'android'] as const).map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={platform === p}
            onClick={() => choosePlatform(p)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
              platform === p ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {p === 'ios' ? 'iPhone or iPad' : 'Android'}
          </button>
        ))}
      </div>

      <div className="flex flex-col md:flex-row gap-6 items-center md:items-start">
        <div className="flex flex-col items-center gap-3 w-full md:w-auto">
          <div aria-hidden="true" className={s.frameWrap}>
            {platform === 'ios' ? <IosPhone screen={screen} /> : <AndroidPhone screen={screen} />}
          </div>

          <div className="flex flex-wrap justify-center gap-1.5">
            {screens.map((sc, i) => (
              <button
                key={sc.tab}
                type="button"
                aria-pressed={screen === i}
                onClick={() => chooseScreen(i)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                  screen === i ? 'bg-brand text-white' : 'bg-white border border-slate-200 text-slate-500'
                }`}
              >
                {i + 1} · {sc.tab}
              </button>
            ))}
          </div>
          <p aria-live="polite" className="text-xs text-slate-500 text-center max-w-[240px] min-h-[2.5rem]">
            {screens[screen].caption}
          </p>
          <button
            type="button"
            onClick={() => setPlayChoice(!playing)}
            className="text-xs text-sky-600 underline underline-offset-2"
          >
            {playing ? 'Pause' : 'Play'}
          </button>
        </div>

        <div className="flex-1 w-full">
          <h4 className="font-semibold text-slate-900 mb-3">
            {platform === 'ios' ? 'On iPhone or iPad' : 'On Android'}
          </h4>
          <ol className="flex flex-col gap-2.5">
            {written.steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-slate-600">
                <span
                  aria-hidden="true"
                  className="flex-none w-6 h-6 rounded-full bg-brand text-xs font-bold text-white flex items-center justify-center"
                >
                  {i + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
          {written.note && <p className="text-xs text-slate-400 mt-3">{written.note}</p>}
        </div>
      </div>
    </div>
  )
}

// ── Mockups ─────────────────────────────────────────────────────────────────

function Status() {
  return (
    <div className={s.status}>
      <span>9:41</span>
      <span className={s.statusRight}>
        5G <span className={s.battery} />
      </span>
    </div>
  )
}

function View({ on, className = '', children }: { on: boolean; className?: string; children: React.ReactNode }) {
  return <div className={`${s.view} ${on ? s.viewOn : ''} ${className}`}>{children}</div>
}

function TydioPage({ icon }: { icon: string }) {
  return (
    <div className={s.page}>
      <div className={s.pageTop}>
        <div className={s.logo}>
          <Image src={icon} alt="" width={26} height={26} loading="eager" />
          Tydio
        </div>
        <div className={s.skel} style={{ height: 90 }} />
        <div className={s.skel} style={{ height: 60 }} />
      </div>
    </div>
  )
}

function GuideSheet({ platform }: { platform: Platform }) {
  const device = DEVICES[platform]
  const guide = getInstallGuide(device)
  return (
    <div className={s.sheet}>
      <p className={s.sheetTitle}>Add Tydio to your home screen</p>
      <p className={s.sheetSub}>Open Tydio in one tap like an app, and get push notifications about your bookings.</p>
      <div className={s.meta}>
        <b>{describeDevice(device)}</b>
        <span>{platform === 'ios' ? 'Using Android?' : 'Using an iPhone?'}</span>
      </div>
      {platform === 'android' && <div className={`${s.cta} ${s.tap}`}>Install Tydio</div>}
      <ol className={s.steps}>
        {guide.steps.map((step, i) => (
          <li key={i}>
            <span className={s.num}>{i + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <p className={s.fine}>Then open Tydio from your home screen. You may need to log in once more the first time.</p>
      <div className={s.cta}>I&apos;ve added it to my home screen</div>
      <span className={s.skip}>Skip</span>
    </div>
  )
}

function HomeGrid({ placeholders, icon }: { placeholders: number; icon: string }) {
  return (
    <div className={s.grid}>
      {Array.from({ length: placeholders }, (_, i) => (
        <div key={i} className={s.app}>
          <div className={s.ic} />
          <span className={s.placeholderLabel} />
        </div>
      ))}
      <div className={`${s.app} ${s.newApp}`}>
        <Image className={s.ic} src={icon} alt="" width={54} height={54} loading="eager" />
        <span className={s.label}>Tydio</span>
      </div>
    </div>
  )
}

function IosPhone({ screen }: { screen: number }) {
  return (
    <div className={`${s.phone} ${s.ios}`}>
      <div className={s.screen}>
        <div className={s.island} />

        <View on={screen === 0}>
          <Status />
          <TydioPage icon={IOS_ICON} />
          <div className={s.scrim} />
          <GuideSheet platform="ios" />
          <div className={s.navbar} />
        </View>

        <View on={screen === 1}>
          <Status />
          <div className={s.page} />
          <div className={s.scrim} />
          <div className={s.iosNative}>
            <div className={s.iosNav}>
              <span>Cancel</span>
              <span>Add to Home Screen</span>
              <span className={s.tap}>Add</span>
            </div>
            <div className={`${s.group} ${s.appRow}`}>
              <Image src={IOS_ICON} alt="" width={58} height={58} loading="eager" />
              <div className={s.appRowText}>
                <div className={s.appName}>Tydio</div>
                <div className={s.appUrl}>https://www.tydioapp.com/</div>
              </div>
            </div>
            <div className={`${s.group} ${s.toggleRow}`}>
              <span>Open as Web App</span>
              <span className={s.switch} />
            </div>
            <p className={s.iosNote}>An icon will be added to your Home Screen so you can quickly access this website.</p>
          </div>
          <div className={s.navbar} />
        </View>

        <View on={screen === 2} className={s.homeIos}>
          <Status />
          <HomeGrid placeholders={8} icon={IOS_ICON} />
          <div className={s.dock}>
            <div className={s.ic} />
            <div className={s.ic} />
            <div className={s.ic} />
            <div className={s.ic} />
          </div>
          <div className={`${s.navbar} ${s.navbarLight}`} />
        </View>
      </div>
    </div>
  )
}

function ChromeBar() {
  return (
    <div className={s.chromeBar}>
      <div className={s.chromeUrl}>tydioapp.com</div>
      <span className={s.dots}>⋮</span>
    </div>
  )
}

function AndroidPhone({ screen }: { screen: number }) {
  return (
    <div className={`${s.phone} ${s.android}`}>
      <div className={s.screen}>
        <div className={s.punch} />

        <View on={screen === 0}>
          <Status />
          <ChromeBar />
          <TydioPage icon={ANDROID_ICON} />
          <div className={s.scrim} />
          <GuideSheet platform="android" />
          <div className={s.navbar} />
        </View>

        <View on={screen === 1}>
          <Status />
          <ChromeBar />
          <div className={s.page} />
          <div className={s.scrim} />
          <div className={s.aDialog}>
            <p className={s.aDialogTitle}>Install app</p>
            <div className={s.aApp}>
              <Image src={ANDROID_ICON} alt="" width={46} height={46} loading="eager" />
              <div>
                <div className={s.appName}>Tydio</div>
                <div className={s.appUrl}>tydioapp.com</div>
              </div>
            </div>
            <div className={s.aActions}>
              <span>Cancel</span>
              <span className={s.tap}>Install</span>
            </div>
          </div>
          <div className={s.navbar} />
        </View>

        <View on={screen === 2} className={s.homeAndroid}>
          <Status />
          <HomeGrid placeholders={4} icon={ANDROID_ICON} />
          <div className={s.aDock}>
            <div className={s.ic} />
            <div className={s.ic} />
            <div className={s.ic} />
            <div className={s.ic} />
          </div>
          <div className={s.aSearch} />
          <div className={`${s.navbar} ${s.navbarLight}`} />
        </View>
      </div>
    </div>
  )
}
