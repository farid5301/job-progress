import type { Turn } from '../types'

// While Claude works, a traveller crosses a little world: the longer the wait,
// the further the journey goes, from a morning walk to outer space. Every cell
// of a scene row is two columns wide (an emoji, or two narrow characters), so
// the rows keep their width as the world scrolls past.

type Chapter = {
  at: number
  name: string
  who: string
  /** The traveller, in two frames. */
  traveller: [string, string]
  /** What follows the traveller, in two frames: dust, a wake, carriages. */
  trail: [string[], string[]]
  sky: string[]
  /** The sun or moon, crossing the sky as the chapter goes on. */
  light?: string
  far: string[]
  near: string[]
  ground: string[]
  groundColor: string
  /** The traveller's row reads as the ground itself (the sea, say). */
  nearColor?: string
  isNight: boolean
  lines: string[]
}

const _ = '  '

const CHAPTERS: Chapter[] = [
  {
    at: 0,
    name: 'Morning walk',
    who: 'Biscuit the dog',
    traveller: ['🐕', '🐕'],
    trail: [['💨'], [_]],
    sky: [_, _, '⛅', _, _, _, _, _, '⛅', _, _, _, _],
    light: '🌞',
    far: ['🌳', _, '🏡', _, _, '🌲', '🌳', _, _, '🌳', '🏠', _, '🌲', _, _],
    near: [_, '🌷', _, _, _, '🌻', _, _, _, '🌼', _, _, _, '🦋', _, _],
    ground: ['▁▁', '▁▁', '▁,', '▁▁', '.▁', '▁▁'],
    groundColor: 'success',
    isNight: false,
    lines: ['is out for a morning walk', 'found a very good stick', 'sniffs every single flower', 'says the code smells nice'],
  },
  {
    at: 45_000,
    name: 'Through the forest',
    who: 'Maple the fox',
    traveller: ['🦊', '🦊'],
    trail: [['🍂'], [_]],
    sky: [_, '⛅', _, _, _, '🐦', _, _, _, _, '⛅', _, _],
    light: '🌞',
    far: ['🌲', '🌲', '🌳', '🌲', _, '🌲', '🌲', '🌲', '🌳', _, '🌲', '🌲'],
    near: [_, '🍄', _, _, '🌿', _, _, _, '🦔', _, _, '🍄', _, _],
    ground: ['▁▁', '▁▂', '▂▁', '▁▁', '▁▁'],
    groundColor: 'success',
    isNight: false,
    lines: ['takes the scenic route', 'waves at a hedgehog', 'knows a shortcut, probably', 'is deep in the woods'],
  },
  {
    at: 2 * 60_000,
    name: 'Along the coast',
    who: 'Captain Sal',
    traveller: ['⛵', '⛵'],
    trail: [[' ~', '~ '], ['~ ', ' ~']],
    sky: [_, '🐦', _, _, '⛅', _, _, _, '🐦', _, _, _, _],
    light: '🌞',
    far: [_, _, '🐳', _, _, _, _, '🌴', _, _, '🐬', _, _, _, _],
    near: ['≈≈', '~≈', '≈~', '≈≈', '≈≈', '~≈'],
    nearColor: 'suggestion',
    ground: [_, '🐠', _, _, _, _, '🐚', _, _, '🐟', _, _, _, '🦀', _],
    groundColor: 'suggestion',
    isNight: false,
    lines: ['sails past a whale', 'is racing a dolphin', 'reports smooth sailing', 'can see land, sort of'],
  },
  {
    at: 5 * 60_000,
    name: 'City lights',
    who: 'Rita the taxi',
    traveller: ['🚕', '🚕'],
    trail: [['💨'], [_]],
    sky: [_, '⭐', _, _, _, '✨', _, _, '⭐', _, _, _, _, '✨'],
    light: '🌙',
    far: ['🏢', '🏬', _, '🏢', '🏨', '🏦', _, '🏢', '🏪', '🏬', _, '🏢'],
    near: [_, _, '🚦', _, _, _, _, _, '🌳', _, _, _, _, '🚏', _],
    ground: ['━━', '━━', _, '━━', '━━', _],
    groundColor: 'subtle',
    isNight: true,
    lines: ['takes the long way through town', 'gets every green light', 'knows the city never sleeps', 'keeps the meter running'],
  },
  {
    at: 10 * 60_000,
    name: 'Over the mountains',
    who: 'The night express',
    traveller: ['🚂', '🚂'],
    trail: [['🚃', '🚃'], ['🚃', '🚃']],
    sky: [_, '⭐', _, _, _, _, '⭐', _, _, '✨', _, _, _],
    light: '🌕',
    far: ['🗻', _, _, '🗻', '🌲', _, '🗻', _, _, '🌲', '🗻', _],
    near: [_, '🌲', _, _, _, _, '🌲', '🌲', _, _, _, _],
    ground: ['==', '=+', '=='],
    groundColor: 'subtle',
    isNight: true,
    lines: ['is a long one. Stretch your legs?', 'climbs, and so does the token count', 'has a dining car, just saying', 'is right on schedule, somehow'],
  },
  {
    at: 20 * 60_000,
    name: 'Into space',
    who: 'Cosmo the rocket',
    traveller: ['🚀', '🚀'],
    trail: [['🔥'], ['💨']],
    sky: [_, '⭐', _, _, '✨', _, _, _, '⭐', _, _, '✨', _],
    far: [_, '🪐', _, _, _, _, _, '🌍', _, _, _, _, '🛸', _, _, _],
    near: [_, _, _, '✨', _, _, _, _, _, '🌠', _],
    ground: ['. ', _, ' .', _, _],
    groundColor: 'subtle',
    isNight: true,
    lines: ['has left the atmosphere', 'says Houston, this is a big job', 'reports that space is very big', 'waves from orbit'],
  },
]

// After the last chapter the journey loops through space in laps of this length.
const LAP_MS = 10 * 60_000

export const chapter = (ms: number): Chapter & { index: number } => {
  let index = 0

  CHAPTERS.forEach((one, i) => {
    if (ms >= one.at) {
      index = i
    }
  })

  return { ...(CHAPTERS[index] as Chapter), index }
}

export const chapterCount = CHAPTERS.length

const progressIn = (ms: number): number => {
  const now = chapter(ms)
  const next = CHAPTERS[now.index + 1]

  return next === undefined ? ((ms - now.at) % LAP_MS) / LAP_MS : (ms - now.at) / (next.at - now.at)
}

/** What comes next and when, for the line under the scene. */
export const untilNext = (ms: number): { name: string; ms: number } | undefined => {
  const next = CHAPTERS[chapter(ms).index + 1]

  return next === undefined ? undefined : { name: next.name, ms: next.at - ms }
}

const windowed = (pattern: string[], offset: number, n: number): string[] =>
  Array.from({ length: n }, (_x, i) => pattern[(((i - offset) % pattern.length) + pattern.length) % pattern.length] ?? _)

export type SceneRow = { text: string; color?: string }

/**
 * The world at this moment, four rows tall: sky, far away, the traveller's
 * row and the ground. Far things drift slower than near ones, the sun or moon
 * crosses the sky over the chapter, and stars twinkle at night.
 */
export const scene = (ms: number, cells: number): SceneRow[] => {
  const ch = chapter(ms)
  const n = Math.max(8, Math.min(24, cells))
  const frame = Math.floor(ms / 500)

  const sky = windowed(ch.sky, Math.floor(frame / 8), n).map((cell, i) =>
    ch.isNight && cell === '⭐' && (i + Math.floor(frame / 2)) % 3 === 0 ? '✨' : cell,
  )
  if (ch.light !== undefined) {
    sky[Math.min(n - 1, Math.floor(progressIn(ms) * n))] = ch.light
  }
  const far = windowed(ch.far, Math.floor(frame / 3), n)
  const near = windowed(ch.near, frame, n)
  const ground = windowed(ch.ground, frame, n)

  // The world scrolls right, so the traveller heads left, the way most emoji face.
  const at = Math.floor(n / 3)
  near[at] = ch.traveller[frame % 2] ?? ch.traveller[0]
  for (const [i, cell] of (ch.trail[frame % 2] ?? []).entries()) {
    if (at + 1 + i < n) {
      near[at + 1 + i] = cell
    }
  }

  return [
    { text: sky.join(''), color: ch.isNight ? 'warning' : 'subtle' },
    { text: far.join('') },
    { text: near.join(''), color: ch.nearColor },
    { text: ground.join(''), color: ch.groundColor },
  ]
}

/** "Biscuit the dog found a very good stick", changing every 8 seconds. */
export const caption = (ms: number): string => {
  const ch = chapter(ms)

  return `${ch.who} ${ch.lines[Math.floor(ms / 8000) % ch.lines.length] ?? ''}`
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** The wait put in everyday terms. */
export const equivalent = (ms: number): string => {
  const s = ms / 1000

  if (s < 60) {
    return `enough for ${plural(Math.max(1, Math.floor(s / 4)), 'deep breath', 'deep breaths')} 🌬`
  }
  if (s < 5 * 60) {
    const songs = Math.floor(s / 210)

    return songs < 1 ? 'most of a pop song 🎵' : `about ${plural(songs, 'pop song', 'pop songs')} 🎵`
  }
  if (s < 25 * 60) {
    return `about ${plural(Math.floor(s / 240), 'cup of tea', 'cups of tea')} ☕`
  }
  if (s < 90 * 60) {
    return `about ${plural(Math.floor(s / (22 * 60)), 'sitcom episode', 'sitcom episodes')} 📺`
  }

  return `a whole movie, popcorn included 🍿`
}

export type ToolKind = 'reads' | 'edits' | 'commands' | 'searches' | 'web' | 'helpers' | 'other'

const base = (path: unknown): string =>
  typeof path === 'string' ? (path.split(/[\\/]/).pop() ?? path) : ''

const clip = (text: string, n: number): string => (text.length > n ? `${text.slice(0, n - 1)}…` : text)

/** What kind of work a tool call is, and a few words on what it is doing. */
export const describeTool = (
  tool: string,
  input: Record<string, unknown>,
): { kind: ToolKind; now: string; file?: string } => {
  const file = base(input.file_path ?? input.notebook_path ?? input.path)

  if (tool === 'Read' || tool === 'NotebookRead') {
    return { kind: 'reads', now: `Reading ${file}` }
  }
  if (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit' || tool === 'NotebookEdit') {
    return { kind: 'edits', now: `${tool === 'Write' ? 'Writing' : 'Editing'} ${file}`, file }
  }
  if (tool === 'Bash' || tool === 'PowerShell') {
    const command = String(input.command ?? '')
      .replace(/^\s*(\{|& \{)\s*/, '')
      .split('\n')[0] ?? ''

    return { kind: 'commands', now: `Running ${clip(command.trim(), 40)}` }
  }
  if (tool === 'Grep' || tool === 'Glob') {
    return { kind: 'searches', now: `Searching for ${clip(String(input.pattern ?? ''), 30)}` }
  }
  if (tool === 'WebSearch' || tool === 'WebFetch' || /browser|chrome/i.test(tool)) {
    return { kind: 'web', now: 'Looking things up on the web' }
  }
  if (tool === 'Agent' || tool === 'Task' || tool === 'Workflow') {
    return { kind: 'helpers', now: 'Briefing a helper agent' }
  }

  return { kind: 'other', now: `Using ${clip(tool.replace(/^mcp__[^_]+__/, ''), 30)}` }
}

/** "📖 12 read · ✏ 4 edited · ⚡ 6 commands", leaving out what is zero. */
export const tally = (t: Turn): string =>
  [
    t.reads > 0 ? `📖 ${t.reads} read` : '',
    t.edits > 0 ? `✏ ${t.edits} edited` : '',
    t.commands > 0 ? `⚡ ${plural(t.commands, 'command', 'commands')}` : '',
    t.searches > 0 ? `🔎 ${plural(t.searches, 'search', 'searches')}` : '',
    t.web > 0 ? `🌐 ${t.web} web` : '',
    t.helpers > 0 ? `🤝 ${plural(t.helpers, 'helper', 'helpers')}` : '',
    t.other > 0 ? `🧰 ${t.other} other` : '',
    t.errors > 0 ? `⚠ ${plural(t.errors, 'error', 'errors')}` : '',
  ]
    .filter(part => part !== '')
    .join(' · ')

export type Fact = { tag: string; icon: string; text: string }

const SCHEDULING = '📅 Scheduling'
const PM = '📋 Project management'
const SCIENCE = '🔬 Science'
const CODE = '💻 Code'

const FACTS: Fact[] = [
  // Scheduling
  { tag: SCHEDULING, icon: '📅', text: 'The Critical Path Method was developed in 1957 by DuPont and Remington Rand to plan plant shutdowns.' },
  { tag: SCHEDULING, icon: '📅', text: 'PERT was created in 1958 for the US Navy’s Polaris missile programme.' },
  { tag: SCHEDULING, icon: '📅', text: 'Karol Adamiecki drew a bar chart schedule in 1896, years before Henry Gantt’s famous chart.' },
  { tag: SCHEDULING, icon: '📅', text: 'A task with zero total float is on the critical path: one day late there is one day late at the finish.' },
  { tag: SCHEDULING, icon: '📅', text: 'Merge bias: where several paths meet, the odds of starting on time drop, which is why risk-run (Monte Carlo) dates land later than CPM dates.' },
  { tag: SCHEDULING, icon: '📅', text: 'The DCMA 14-point check flags a schedule when more than 5% of its tasks carry over 44 working days of float.' },
  { tag: SCHEDULING, icon: '📅', text: 'A lag is a wait between tasks. Use it for concrete curing, not as a hidden buffer: hidden time is the first time to vanish.' },
  { tag: SCHEDULING, icon: '📅', text: 'Hofstadter’s Law: it always takes longer than you expect, even when you take Hofstadter’s Law into account.' },
  { tag: SCHEDULING, icon: '📅', text: 'The word "deadline" first meant a line around a Civil War prison camp that prisoners must not cross.' },
  { tag: SCHEDULING, icon: '📅', text: 'Student syndrome: people start a task at the last moment its float allows. Critical chain moves that float into one shared buffer.' },
  { tag: SCHEDULING, icon: '📅', text: 'The cone of uncertainty: an estimate made at the idea stage can be off by a factor of four either way.' },
  { tag: SCHEDULING, icon: '📅', text: 'The planning fallacy, our habit of underestimating our own tasks, was named by Kahneman and Tversky in 1979.' },
  // Project management
  { tag: PM, icon: '📋', text: 'Brooks’s Law: adding people to a late software project makes it later.' },
  { tag: PM, icon: '📋', text: 'Parkinson’s Law: work expands to fill the time available for its completion.' },
  { tag: PM, icon: '📋', text: 'The Sydney Opera House was planned for 4 years and A$7 million. It took 14 years and A$102 million.' },
  { tag: PM, icon: '📋', text: 'The Empire State Building went up in about 13 months, ahead of schedule and under budget.' },
  { tag: PM, icon: '📋', text: 'Berlin Brandenburg Airport opened in 2020, nine years later than planned.' },
  { tag: PM, icon: '📋', text: 'Bent Flyvbjerg found only about 0.5% of big projects finish on budget, on time and with the benefits promised.' },
  { tag: PM, icon: '📋', text: 'The Pentagon, then the largest office building in the world, was built in about 16 months.' },
  { tag: PM, icon: '📋', text: 'Murphy’s Law was born at Edwards Air Force Base around 1949, during rocket-sled tests.' },
  { tag: PM, icon: '📋', text: 'Scrum takes its name from rugby, after a 1986 paper by Takeuchi and Nonaka.' },
  { tag: PM, icon: '📋', text: 'The ninety-ninety rule: the first 90% of the work takes 90% of the time. The last 10% takes the other 90%.' },
  // Science
  { tag: SCIENCE, icon: '🔬', text: 'Time runs a little faster at your head than at your feet. Atomic clocks can measure the difference.' },
  { tag: SCIENCE, icon: '🔬', text: 'GPS satellites gain about 38 microseconds a day from relativity. Uncorrected, positions would drift kilometres daily.' },
  { tag: SCIENCE, icon: '🔬', text: 'Bananas are slightly radioactive, thanks to potassium-40.' },
  { tag: SCIENCE, icon: '🔬', text: 'At its triple point, water boils and freezes at the same time.' },
  { tag: SCIENCE, icon: '🔬', text: 'Old church windows are thicker at the bottom because of how they were made, not because glass flows.' },
  { tag: SCIENCE, icon: '🔬', text: 'Tardigrades survived 10 days in open space in 2007.' },
  { tag: SCIENCE, icon: '🔬', text: 'A day on Venus is longer than its year, and Venus spins backwards.' },
  { tag: SCIENCE, icon: '🔬', text: 'Octopuses have three hearts and blue blood.' },
  { tag: SCIENCE, icon: '🔬', text: 'Wombat poop is cube-shaped.' },
  { tag: SCIENCE, icon: '🔬', text: 'Lightning is about five times hotter than the surface of the Sun.' },
  { tag: SCIENCE, icon: '🔬', text: 'Saturn is less dense than water.' },
  { tag: SCIENCE, icon: '🔬', text: 'Sunlight takes about 8 minutes to reach Earth, so you always see the Sun as it was.' },
  // Code
  { tag: CODE, icon: '💻', text: 'NASA lost the Mars Climate Orbiter in 1999 because one team worked in imperial units and another in metric.' },
  { tag: CODE, icon: '💻', text: 'Ariane 5’s first flight in 1996 failed over a 64-bit number squeezed into 16 bits.' },
  { tag: CODE, icon: '💻', text: 'The first logged computer bug was a real moth, taped into the Harvard Mark II logbook in 1947.' },
  { tag: CODE, icon: '💻', text: 'JavaScript was written in about ten days in 1995.' },
  { tag: CODE, icon: '💻', text: 'Python is named after Monty Python, not the snake.' },
  { tag: CODE, icon: '💻', text: 'Git was started by Linus Torvalds in 2005, in a matter of days.' },
]

/** The fact for a turn of the fact clock, which moves every 15 seconds. */
export const fact = (index: number): Fact => FACTS[Math.abs(index) % FACTS.length] as Fact

/** The words after the spinner's own: where the journey is, the wait in tea, or the tally, in turn. */
export const spinnerText = (t: Turn): string => {
  const ch = chapter(t.elapsedMs)
  const counts = tally(t)
  const options = [`${ch.traveller[0]} ${ch.name.toLowerCase()}`, `≈ ${equivalent(t.elapsedMs)}`]

  if (counts !== '') {
    options.push(counts)
  }

  return options[Math.floor(t.elapsedMs / 6000) % options.length] ?? ''
}

/** Remembers an edited file, newest first, each once. */
export const noteFile = (files: string[], file: string): string[] =>
  file === '' ? files : [file, ...files.filter(one => one !== file)].slice(0, 8)

export const emptyTurn = (): Turn => ({
  id: '',
  running: false,
  startedAt: 0,
  elapsedMs: 0,
  reads: 0,
  edits: 0,
  commands: 0,
  searches: 0,
  web: 0,
  helpers: 0,
  other: 0,
  errors: 0,
  files: [],
  now: '',
  reason: '',
  tokens: 0,
})
