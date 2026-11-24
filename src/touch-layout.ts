type Positions = Record<string, [number, number]>
const labels: Record<string, string> = {
  stick: 'الحركة',
  sprint: 'ركض',
  jump: 'قفز',
  crouch: 'انحناء',
  pulse: 'نداء',
  act: 'تفاعل',
}
function anchor() {
  return innerWidth > innerHeight ? 'landscape-' : 'portrait-'
}
export function placeButtons(layout: Positions) {
  for (const key of Object.keys(labels)) {
    const node = document.querySelector<HTMLElement>(
      key === 'stick' ? '#stick' : '[data-key="' + key + '"]',
    )!
    const pos = layout[anchor() + key]
    node.classList.toggle('positioned', !!pos)
    if (pos) {
      node.style.setProperty('--px', pos[0] + 'vw')
      node.style.setProperty('--py', pos[1] + 'dvh')
    }
  }
}
export function editButtons(existing: Positions, save: (p: Positions) => void) {
  const placement = structuredClone(existing),
    panel = document.createElement('section')
  panel.id = 'touch-editor'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', 'تخصيص مواضع الأزرار')
  const keyPrefix = anchor(),
    isWide = innerWidth > innerHeight
  const defaultX = [0.13, 0.76, 0.85, 0.94, 0.8, 0.9],
    defaultY = [0.73, 0.68, 0.65, 0.68, 0.85, 0.85]
  panel.innerHTML =
    '<div class="layout-head"><strong>مواضع أزرار اللمس</strong><span>اسحب كلّ زر إلى الموضع المناسب.</span><button class="secondary" data-reset>إعادة الضبط</button><button class="gold" data-save>حفظ</button></div>'
  function draw() {
    panel.querySelectorAll('.drag-button').forEach((n) => n.remove())
    Object.keys(labels).forEach((key, i) => {
      const b = document.createElement('button')
      b.textContent = labels[key]
      b.className = 'drag-button'
      b.ariaLabel = 'موضع ' + labels[key]
      const id = keyPrefix + key,
        initial = placement[id] || [
          defaultX[i] * 100,
          (isWide ? defaultY[i] : Math.min(0.93, defaultY[i] + 0.03)) * 100,
        ]
      b.style.left = initial[0] + '%'
      b.style.top = initial[1] + '%'
      panel.append(b)
      b.onpointerdown = (e) => {
        b.setPointerCapture(e.pointerId)
        e.preventDefault()
      }
      b.onpointermove = (e) => {
        if (!b.hasPointerCapture(e.pointerId)) return
        const margin = b.offsetWidth / 2 + 3,
          x = Math.max(margin, Math.min(innerWidth - margin, e.clientX)),
          y = Math.max(96, Math.min(innerHeight - margin, e.clientY))
        placement[id] = [(x / innerWidth) * 100, (y / innerHeight) * 100]
        b.style.left = placement[id][0] + '%'
        b.style.top = placement[id][1] + '%'
      }
    })
  }
  panel.querySelector<HTMLButtonElement>('[data-reset]')!.onclick = () => {
    for (const k of Object.keys(placement)) if (k.startsWith(keyPrefix)) delete placement[k]
    draw()
  }
  panel.querySelector<HTMLButtonElement>('[data-save]')!.onclick = () => {
    panel.remove()
    save(placement)
  }
  draw()
  document.body.append(panel)
  panel.querySelector<HTMLButtonElement>('[data-save]')?.focus()
}
