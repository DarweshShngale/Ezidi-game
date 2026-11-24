const paths: Record<string, string> = {
  sun:
    '<circle cx="12" cy="12" r="4"/>' +
    Array.from(
      { length: 16 },
      (_, i) => '<path d="M12 1v3" transform="rotate(' + i * 22.5 + ' 12 12)"/>',
    ).join(''),
  play: '<path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none"/>',
  resume: '<path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/>',
  sound: '<path d="M3 9h4l5-4v14l-5-4H3zm13-1q4 4 0 8m3-11q7 7 0 14"/>',
  mute: '<path d="M3 9h4l5-4v14l-5-4H3zm13 0 6 6m0-6-6 6"/>',
  full: '<path d="M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6"/>',
  book: '<path d="M12 6q-4-3-9-2v15q5-1 9 2 4-3 9-2V4q-5-1-9 2v15"/>',
  settings: '<path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 3v6m8 0v6M9 15v6" stroke-width="3"/>',
  pad: '<path d="M8 7h8q3 0 4 4l1.4 6q.4 4-3 2l-3-3H9l-3 3q-3.5 2-3-2l1.4-6Q5 7 8 7Z"/><path d="M8 9v5m-2.5-2.5h5M16 10h.3m2 3h.3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  pause: '<path d="M8 5v14m8-14v14" stroke-width="3"/>',
  bag: '<rect x="5" y="7" width="14" height="14" rx="3"/><path d="M9 7V5a3 3 0 0 1 6 0v2m-7 7h8"/>',
  close: '<path d="m5 5 14 14M19 5 5 19"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
}
export function icon(name: string) {
  return (
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">' +
    (paths[name] || '') +
    '</svg>'
  )
}
