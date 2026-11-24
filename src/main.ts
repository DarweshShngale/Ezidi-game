import './style.css'
import { placeButtons, editButtons } from './touch-layout'
import { icon } from './icons'
import { chapters, ordinal, arabic } from './story'
import { defaults, initial, read, write, type Settings } from './save'
import { GameAudio } from './audio'
import type { Engine } from './engine'

const el = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E
const home = el('home'),
  overlay = el('overlay'),
  hud = el('hud'),
  audio = new GameAudio()
const base = import.meta.env.BASE_URL
let settings = { ...defaults },
  progress = initial(),
  engine: Engine | undefined,
  enginePromise: Promise<Engine> | undefined
let mode: 'home' | 'playing' | 'paused' | 'film' | 'loading' = 'home'
let page = '',
  generation = 0,
  toastTimer = 0,
  subTimer = 0
const htmlEsc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
function announce(msg: string) {
  const n = el('toast')
  n.textContent = msg
  n.hidden = false
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (n.hidden = true), 2400)
}
function hideOverlay() {
  overlay.hidden = true
  overlay.className = ''
  overlay.replaceChildren()
  page = ''
}
function showPanel(title: string, body: string, name: string, close = true) {
  page = name
  overlay.hidden = false
  overlay.className = ''
  overlay.innerHTML =
    '<section class="panel" role="dialog" aria-modal="true" aria-label="' +
    title +
    '">' +
    (close
      ? '<button class="close" data-do="back" aria-label="رجوع">' + icon('close') + '</button>'
      : '') +
    '<h2>' +
    title +
    '</h2>' +
    body +
    '</section>'
  overlay.querySelector<HTMLElement>('button:not(:disabled),select')?.focus({ preventScroll: true })
}
const btn = (id: string, label: string, primary = false) =>
  '<button class="' + (primary ? 'gold' : 'secondary') + '" data-do="' + id + '">' + label + '</button>'
function syncHome() {
  el<HTMLButtonElement>('continue').disabled = !progress.time || progress.done
  el('foot-num').textContent = ordinal[progress.chapter]
  el('foot-title').textContent = chapters[progress.chapter].name
  document.querySelector('.chapter-pips')!.innerHTML = chapters
    .map(
      (c, i) =>
        '<button class="' +
        (i === progress.chapter ? 'on' : '') +
        '" data-chapter-preview="' +
        i +
        '" title="' +
        c.name +
        '" aria-label="' +
        c.name +
        '"></button>',
    )
    .join('')
}
el('guide').addEventListener('click', () => engine?.guide())
function applySettings() {
  placeButtons(settings.buttons)
  engine?.outfit()
  document.body.classList.toggle('mirror', settings.mirror)
  document.body.classList.toggle('large', settings.large)
  document.body.classList.toggle('reduced', settings.reduce)
  document.documentElement.style.setProperty('--offset', settings.offset + 'px')
  audio.setVolume(settings.volume)
  audio.setMusic(settings.music)
  audio.setSpeech(settings.speech)
  el('sound').innerHTML = icon(settings.volume ? 'sound' : 'mute')
  el('sound').setAttribute('aria-label', settings.volume ? 'كتم الصوت' : 'تشغيل الصوت')
  if (!settings.subs) el('dialogue').hidden = true
}
async function save() {
  progress.time = Date.now()
  const ok = await write('progress', structuredClone(progress))
  if (!ok) announce('تعذّر الحفظ على هذا الجهاز')
  syncHome()
}
function goHome() {
  generation++
  engine?.stop()
  audio.pause()
  mode = 'home'
  hideOverlay()
  hud.hidden = true
  home.hidden = false
  el('dialogue').hidden = true
  syncHome()
  el('start').focus({ preventScroll: true })
}
function showPause() {
  if (mode === 'playing') {
    mode = 'paused'
    engine?.stop()
  }
  if (mode !== 'paused') return
  showPanel(
    'توقّف مؤقت',
    '<div class="stack">' +
      btn('resume', 'العودة إلى اللعب', true) +
      btn('bag', 'الحقيبة والوثائق') +
      btn('settings', 'الإعدادات') +
      btn('help', 'طريقة اللعب') +
      btn('home', 'القائمة الرئيسية') +
      '</div>',
    'pause',
    false,
  )
}
function back() {
  if (page === 'chapter-detail') {
    showChapters()
    return
  }
  if (mode === 'paused') {
    if (page === 'pause') resume()
    else showPause()
  } else if (mode === 'home') hideOverlay()
}
function resume() {
  if (!engine) return
  mode = 'playing'
  home.hidden = true
  hud.hidden = false
  hideOverlay()
  engine.resume()
}
function settingsPanel() {
  const sel = (id: keyof Settings, label: string, options: [number, string][]) =>
    '<label class="setting">' +
    label +
    '<select data-setting="' +
    id +
    '">' +
    options
      .map(
        ([v, n]) =>
          '<option value="' + v + '" ' + (settings[id] === v ? 'selected' : '') + '>' + n + '</option>',
      )
      .join('') +
    '</select></label>'
  const check = (id: keyof Settings, label: string) =>
    '<label class="setting">' +
    label +
    '<input type="checkbox" data-setting="' +
    id +
    '" ' +
    (settings[id] ? 'checked' : '') +
    '></label>'
  const range = (id: keyof Settings, label: string, min: number, max: number, step: number) =>
    '<label class="setting">' +
    label +
    '<input type="range" min="' +
    min +
    '" max="' +
    max +
    '" step="' +
    step +
    '" value="' +
    settings[id] +
    '" data-setting="' +
    id +
    '"></label>'
  showPanel(
    'الإعدادات',
    '<h3>الصورة واللعب</h3>' +
      sel('quality', 'جودة الرسوم', [
        [-1, 'تلقائية'],
        [0, 'منخفضة'],
        [1, 'متوسطة'],
        [2, 'عالية'],
        [3, 'فائقة'],
      ]) +
      sel('difficulty', 'الصعوبة', [
        [0, 'هادئة'],
        [1, 'عادية'],
        [2, 'صعبة'],
      ]) +
      check('first', 'منظور الشخص الأول') +
      check('guide', 'إظهار علامة الهدف على الخريطة') +
      check('assist', 'توسيع نطاق نداء المساندة') +
      '<h3>الصوت وإمكانية الوصول</h3>' +
      range('volume', 'مستوى الصوت', 0, 1, 0.05) +
      check('music', 'الموسيقى التصويرية') +
      check('speech', 'قراءة الحوار بصوت عربي متاح على الجهاز') +
      check('subs', 'ترجمة الحوار') +
      check('large', 'تكبير النص') +
      check('reduce', 'تقليل حركة الكاميرا') +
      '<h3>التحكّم باللمس</h3>' +
      range('sensitivity', 'حساسية الكاميرا', 0.3, 2.5, 0.1) +
      check('haptic', 'اهتزاز عند التفاعل') +
      check('mirror', 'تبديل جهة عصا الحركة') +
      range('offset', 'ارتفاع الأزرار', 0, 50, 2) +
      btn('layout', 'تخصيص مواضع الأزرار') +
      '<h3>مظهر سومر</h3><p class="note">تظهر صورتك في دفتر الرحلة ويُستوحى منها لون وشاح سومر.</p><label class="setting">صورة مرجعية من جهازك<input type="file" id="reference" accept="image/*"></label>' +
      (settings.portrait ? btn('clear-portrait', 'إزالة الصورة') : '') +
      '<div class="row">' +
      btn('full', 'ملء الشاشة') +
      btn('back', 'تمّ', true) +
      '</div>',
    'settings',
  )
}
function helpPanel() {
  const keys = (s: string) =>
    '<span class="keys">' +
    s
      .split(' ')
      .map((k) => '<kbd>' + k + '</kbd>')
      .join('') +
    '</span>'
  showPanel(
    'طريقة اللعب',
    '<p>اتبع المعيّن الذهبي على الخريطة. اقترب من الشخص أو الغرض حتى يظهر فعل التفاعل. عند مرافقة أحد الناجين، انتظره عند الوصول.</p>' +
      [
        ['الحركة', 'W A S D'],
        ['تدوير الكاميرا', '← →'],
        ['الركض والقفز', 'Shift Space'],
        ['الانحناء والتفاعل', 'C E'],
        ['السير الموجّه نحو المهمّة', 'G'],
        ['نداء المساندة', 'Q'],
        ['الحقيبة والإيقاف', 'I Esc'],
      ]
        .map(([l, k]) => '<div class="row">' + l + keys(k) + '</div>')
        .join('') +
      '<p>اسحب بالفأرة أو بإصبعك لتدير الكاميرا. على الهاتف، حرّك العصا بيد واضغط أزرار الحركة باليد الأخرى. اسحب خارج الأزرار للنظر حولك.</p><p>تُحفظ كلّ مهمّة عند إكمالها. نداء المساندة يُبعد الخصم ويستهلك بعض الطاقة.</p>',
    'help',
  )
}
function showChapters() {
  showPanel(
    'اختيار الفصل',
    '<div class="chapter-list">' +
      chapters
        .map(
          (c, i) =>
            '<button class="chapter-card" style="--chapter-art:url(' +
            base +
            'art/chapter-' +
            (i + 1) +
            '.webp)" data-chapter-preview="' +
            i +
            '"><small>الفصل ' +
            ordinal[i] +
            '</small>' +
            icon(i > progress.unlocked ? 'lock' : i < progress.unlocked ? 'check' : 'book') +
            '<b>' +
            c.name +
            '</b></button>',
        )
        .join('') +
      '</div>',
    'chapters',
  )
}
function chapterDetail(i: number) {
  const c = chapters[i]
  showPanel(
    c.name,
    '<div class="eyebrow">الفصل ' +
      ordinal[i] +
      ' · ' +
      c.place +
      '</div><p>' +
      c.intro +
      '</p>' +
      (i <= progress.unlocked
        ? '<button class="gold" data-chapter="' + i + '">العب الفصل</button>'
        : '<p>' + icon('lock') + ' يُفتح بعد إكمال الفصل السابق.</p>'),
    'chapter-detail',
  )
}
function bag() {
  if (mode === 'playing') {
    mode = 'paused'
    engine?.stop()
  }
  showPanel(
    'دفتر الرحلة',
    (settings.portrait
      ? '<img class="portrait" alt="صورة سومر" src="' + htmlEsc(settings.portrait) + '">'
      : '') +
      '<div class="eyebrow">سومر · الفصل ' +
      ordinal[progress.chapter] +
      '</div><h3>مقتنيات الرحلة</h3>' +
      (progress.items.length
        ? progress.items
            .map((name) => '<div class="row">' + htmlEsc(name) + icon('book') + '</div>')
            .join('')
        : '<p>ستظهر هنا الوثائق والمؤن التي تجمعها.</p>') +
      '<h3>المؤن</h3><div class="row"><span>ماء · ' +
      arabic(progress.water) +
      '</span>' +
      btn('drink', 'اشرب لاستعادة الطاقة') +
      '</div><div class="row"><span>ضمادات · ' +
      arabic(progress.bandages) +
      '</span>' +
      btn('bandage', 'استعمل ضمادة') +
      '</div>' +
      btn('back', 'رجوع'),
    'bag',
  )
}
function useSupply(water: boolean) {
  const key = water ? 'water' : 'bandages'
  if (progress[key] < 1) {
    announce('نفدت هذه المؤن')
    return
  }
  if (!engine?.replenish(water)) {
    announce(water ? 'طاقتك مكتملة' : 'صحّتك مكتملة')
    return
  }
  progress[key]--
  void save()
  bag()
  announce(water ? 'استعدت طاقتك' : 'استعدت بعض صحّتك')
}
function subtitle(who: string, line: string) {
  audio.dialogue(line)
  clearTimeout(subTimer)
  if (!settings.subs) return
  const d = el('dialogue')
  d.innerHTML = '<b>' + who + '</b> · ' + line
  d.hidden = false
  subTimer = window.setTimeout(() => (d.hidden = true), 6500)
}
function hudText() {
  const p = progress,
    c = chapters[p.chapter]
  el('chapter-label').textContent = 'الفصل ' + ordinal[p.chapter] + ' · ' + c.name
  el('mission').textContent = c.tasks[p.step].title
}
function film(end: boolean) {
  engine?.stop()
  mode = 'film'
  page = end ? 'outro' : 'intro'
  home.hidden = true
  hud.hidden = true
  overlay.hidden = false
  overlay.className = 'film-mode'
  const c = chapters[progress.chapter]
  overlay.style.setProperty(
    '--film-art',
    "url('" + base + 'art/chapter-' + (progress.chapter + 1) + ".webp')",
  )
  const final = end && progress.chapter === 6
  overlay.innerHTML =
    '<section class="film" role="dialog" aria-modal="true"><small>الفصل ' +
    ordinal[progress.chapter] +
    ' · ' +
    c.place +
    ' · ' +
    c.time +
    '</small><h2>' +
    (final ? 'لن تنطفئ شمسنا' : c.name) +
    '</h2><p>' +
    (end ? c.end : c.intro) +
    '</p>' +
    (settings.subs ? '<blockquote>«' + (end ? c.tasks.at(-1)!.line : c.voice) + '»</blockquote>' : '') +
    btn(
      end ? 'next' : 'enter',
      end ? (final ? 'العودة إلى القائمة' : 'الفصل التالي') : 'ادخل الفصل',
      true,
    ) +
    '</section>'
  audio.setChapter(progress.chapter)
  void audio.start().then(() => audio.dialogue(end ? c.end : c.voice))
  overlay.querySelector('button')?.focus({ preventScroll: true })
}
async function startChapter(index: number, replay = false) {
  if (replay) {
    progress.chapter = index
    progress.step = 0
    progress.done = false
  }
  await save()
  film(false)
}
async function enter() {
  const token = ++generation
  mode = 'loading'
  showPanel('جارٍ تجهيز الحيّ', '<p>تُحمَّل الشخصيات وتفاصيل الجبل…</p>', 'loading', false)
  try {
    enginePromise ??= import('./engine')
      .then((m) =>
        m.buildGame(settings, audio, {
          complete: completeTask,
          failure: () => {
            mode = 'paused'
            showPanel(
              'نحتاج إلى استراحة',
              '<p>استعد أنفاسك واستأنف من آخر نقطة حفظ.</p>' + btn('retry', 'استعد نقاط الصحة', true),
              'retry',
              false,
            )
          },
          notice: announce,
          pause: showPause,
          bag,
        }),
      )
      .catch((error) => {
        enginePromise = undefined
        throw error
      })
    engine = await enginePromise
    if (token !== generation) return
    engine.load(progress.chapter, progress.step)
    hudText()
    resume()
    subtitle('سومر', chapters[progress.chapter].voice)
  } catch (e) {
    console.error(e)
    mode = 'home'
    home.hidden = false
    hud.hidden = true
    audio.pause()
    showPanel(
      'تعذّر فتح ساحة اللعب',
      '<p>تحقّق من تفعيل تسريع الرسوم ودعم WebGL 2، ثم جرّب مجدداً.</p>' +
        btn('retry', 'إعادة المحاولة', true),
      'error',
    )
  }
}
function completeTask() {
  const c = chapters[progress.chapter],
    t = c.tasks[progress.step]
  if (t.item === 'قربة ماء') progress.water += 2
  if (t.item === 'ضمادات العيادة') progress.bandages += 2
  if (t.item && !progress.items.includes(t.item)) progress.items.push(t.item)
  if (progress.step === c.tasks.length - 1) {
    progress.unlocked = Math.max(progress.unlocked, Math.min(6, progress.chapter + 1))
    const finished = progress.chapter
    film(true)
    // Persist the NEXT playable objective while the chapter outro remains on screen.
    const checkpoint = {
      ...progress,
      chapter: Math.min(6, finished + 1),
      step: 0,
      done: finished === 6,
      time: Date.now(),
    }
    progress.time = checkpoint.time
    progress.done = checkpoint.done
    void write('progress', structuredClone(checkpoint)).then((ok) => {
      if (!ok) announce('تعذّر الحفظ على هذا الجهاز')
    })
    return
  }
  progress.step++
  hudText()
  engine!.advance(progress.step)
  subtitle(t.who, t.line)
  announce('تم تحديث المهمة · تم حفظ تقدم اللعبة')
  void save()
}
async function next() {
  if (progress.chapter === 6) {
    goHome()
    return
  }
  progress.chapter++
  progress.step = 0
  await save()
  film(false)
}
async function fullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      return
    }
    await document.documentElement.requestFullscreen()
    const o = screen.orientation as ScreenOrientation & { lock?: (v: string) => Promise<void> }
    await o?.lock?.('landscape').catch(() => {})
  } catch {
    announce('أدِر جهازك أفقياً لتوسيع ساحة اللعب')
  }
}
const commands: Record<string, () => unknown> = {
  drink: () => useSupply(true),
  bandage: () => useSupply(false),
  full: fullscreen,
  chapters: showChapters,
  settings: settingsPanel,
  help: helpPanel,
  pause: showPause,
  resume,
  back,
  bag,
  home: goHome,
  enter,
  retry: enter,
  next,
  about: () =>
    showPanel(
      'عن اللعبة',
      '<p>سنجار – صمود الشمس مغامرة قصصية عن سومر، شاب إيزيدي يحاول جمع عائلته وحماية جيرانه في سنجار.</p><p>تستلهم القصة ذاكرة الإبادة التي ارتكبها داعش بحقّ الإيزيديين في آب ٢٠١٤. الشخصيات والحيّ والمواقف خيالية. تحضر الشمس والطاووس والكتابات الجدارية في مواضع تحترم معناها.</p><p>إلى أهل سنجار، وإلى العائلات التي ما زالت تنتظر عودة أحبّتها.</p>',
      'about',
    ),
  layout: () => {
    editButtons(settings.buttons, (positions) => {
      settings.buttons = positions
      applySettings()
      void write('settings', settings)
      settingsPanel()
    })
  },
  'clear-portrait': () => {
    settings.cloth = ''
    settings.portrait = ''
    applySettings()
    void write('settings', settings)
    settingsPanel()
  },
  'new-confirm': () => {
    progress = { ...initial(), unlocked: progress.unlocked }
    void startChapter(0, true)
  },
}
function start() {
  if (progress.time && !progress.done)
    showPanel(
      'بدء رحلة جديدة',
      '<p>سيبدأ سومر من الفصل الأول. ستبقى الفصول التي فتحتها متاحة للاختيار.</p><div class="hero-actions">' +
        btn('new-confirm', 'ابدأ من جديد', true) +
        btn('back', 'رجوع') +
        '</div>',
      'confirm',
    )
  else commands['new-confirm']()
}
document.addEventListener('click', (e) => {
  const b = (e.target as Element).closest<HTMLButtonElement>('button')
  if (!b || b.disabled) return
  if (b.dataset.do) {
    commands[b.dataset.do]?.()
    return
  }
  if (b.dataset.chapterPreview !== undefined) {
    chapterDetail(Number(b.dataset.chapterPreview))
    return
  }
  if (b.dataset.chapter !== undefined) {
    void startChapter(Number(b.dataset.chapter), true)
    return
  }
  if (b.id === 'start') start()
  if (b.id === 'continue') {
    if (progress.step === 0) film(false)
    else void enter()
  }
  if (b.id === 'sound') {
    settings.volume = settings.volume ? 0 : 0.55
    applySettings()
    if (settings.volume) void audio.start()
    else audio.pause()
    void write('settings', settings)
  }
})
document.addEventListener('change', async (event) => {
  const input = event.target as HTMLInputElement
  if (input.id === 'reference' && input.files?.[0]) {
    try {
      const image = await createImageBitmap(input.files[0])
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 128
      const size = Math.min(image.width, image.height)
      canvas
        .getContext('2d')!
        .drawImage(
          image,
          (image.width - size) / 2,
          (image.height - size) / 2,
          size,
          size,
          0,
          0,
          128,
          128,
        )
      image.close()
      const pixels = canvas.getContext('2d')!.getImageData(32, 72, 64, 48).data
      const rgb = [0, 0, 0]
      for (let n = 0; n < pixels.length; n += 4) for (let j = 0; j < 3; j++) rgb[j] += pixels[n + j]
      settings.cloth =
        '#' +
        rgb
          .map((v) =>
            Math.round(v / (pixels.length / 4))
              .toString(16)
              .padStart(2, '0'),
          )
          .join('')
      engine?.outfit()
      settings.portrait = canvas.toDataURL('image/jpeg', 0.78)
      await write('settings', settings)
      settingsPanel()
    } catch {
      announce('تعذّرت قراءة الصورة')
    }
    return
  }
  const k = input.dataset.setting as keyof Settings
  if (!k) return
  if (input.type === 'checkbox') Object.assign(settings, { [k]: input.checked })
  else Object.assign(settings, { [k]: Number(input.value) })
  applySettings()
  if (k === 'quality') engine?.configure()
  await write('settings', settings)
})
document.addEventListener('keydown', (e) => {
  if (
    e.code === 'Escape' &&
    mode !== 'playing' &&
    mode !== 'loading' &&
    page &&
    page !== 'intro' &&
    page !== 'outro'
  ) {
    e.preventDefault()
    e.stopPropagation()
    back()
  }
  if (e.code === 'Tab' && !overlay.hidden) {
    const options = [...overlay.querySelectorAll<HTMLElement>('button:not(:disabled),select,input')]
    if (!options.length) return
    const a = document.activeElement
    if (e.shiftKey && a === options[0]) {
      e.preventDefault()
      options.at(-1)?.focus()
    } else if (!e.shiftKey && a === options.at(-1)) {
      e.preventDefault()
      options[0].focus()
    }
  }
})
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (mode === 'playing') showPause()
    else audio.pause()
  }
})
for (const node of document.querySelectorAll<HTMLElement>('[data-icon]'))
  node.innerHTML = icon(node.dataset.icon!)
async function init() {
  ;[settings, progress] = await Promise.all([read('settings', defaults), read('progress', initial())])
  applySettings()
  syncHome()
  el<HTMLButtonElement>('start').disabled = false
  if (import.meta.env.PROD && 'serviceWorker' in navigator)
    void navigator.serviceWorker.register(base + 'sw.js', { scope: base }).catch(() => {})
}
void init()
