import type { Turn } from '../types'

// While Claude works, a pet hatches and grows: the longer the wait, the
// bigger it gets. Each stage starts at `at` milliseconds into the turn.
type Stage = { at: number; pet: string; short: string; line: string }

const STAGES: Stage[] = [
  { at: 0, pet: '🥚', short: 'an egg appeared', line: 'An egg appeared. Something is moving in there.' },
  { at: 20_000, pet: '🐣', short: 'it hatched!', line: 'It hatched! Say hi.' },
  { at: 60_000, pet: '🐥', short: 'growing up', line: 'A chick. It is learning to code by watching.' },
  { at: 3 * 60_000, pet: '🐔', short: 'all grown up', line: 'All grown up. Now it judges your variable names.' },
  { at: 7 * 60_000, pet: '🦖', short: "that's no chicken", line: 'Wait… that is not a chicken.' },
  { at: 15 * 60_000, pet: '🐉', short: "it's a dragon now", line: 'It is a dragon now. That was a long one.' },
]

// After the last stage the dragon flies laps of this length.
const LAP_MS = 15 * 60_000

export const stage = (ms: number): Stage => {
  let found = STAGES[0] as Stage

  for (const one of STAGES) {
    if (ms >= one.at) {
      found = one
    }
  }

  return found
}

const nextStage = (ms: number): Stage | undefined => STAGES.find(one => one.at > ms)

/** The pet walks toward what it grows into next; the walk ends as it does. */
export const walk = (ms: number, cells: number): string => {
  const now = stage(ms)
  const next = nextStage(ms)
  const n = Math.max(4, cells)
  const last = n - 1
  const share = next === undefined ? ((ms - now.at) % LAP_MS) / LAP_MS : (ms - now.at) / (next.at - now.at)
  const pos = Math.min(last - 1, Math.floor(share * last))
  const out: string[] = []

  for (let i = 0; i < last; i++) {
    out.push(i === pos ? now.pet : i < pos ? '  ' : '· ')
  }
  out.push(next?.pet ?? '🏰')

  return out.join('')
}

/** When the pet grows next, for the line under the walk. */
export const untilNext = (ms: number): string | undefined => {
  const next = nextStage(ms)

  return next === undefined ? undefined : `${next.pet} in ${Math.ceil((next.at - ms) / 1000)}s`
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
export const describeTool = (tool: string, input: Record<string, unknown>): { kind: ToolKind; now: string } => {
  const file = base(input.file_path ?? input.notebook_path ?? input.path)

  if (tool === 'Read' || tool === 'NotebookRead') {
    return { kind: 'reads', now: `Reading ${file}` }
  }
  if (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit' || tool === 'NotebookEdit') {
    return { kind: 'edits', now: `${tool === 'Write' ? 'Writing' : 'Editing'} ${file}` }
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
  ]
    .filter(part => part !== '')
    .join(' · ')

const FACTS = [
  'Octopuses have three hearts.',
  'Bananas are berries. Strawberries are not.',
  'A day on Venus is longer than its year.',
  'Wombat poop is cube-shaped.',
  'Sharks are older than trees.',
  'Sea otters hold hands while they sleep.',
  'A group of flamingos is called a flamboyance.',
  'The first computer bug was a real moth, taped into a logbook in 1947.',
  'There are more possible chess games than atoms in the observable universe.',
  'Sunlight takes about 8 minutes to reach Earth.',
  'Koala fingerprints are almost identical to human ones.',
  'The shortest war on record lasted about 38 minutes.',
  'Butterflies taste with their feet.',
  'Pluto has not finished one orbit since it was discovered in 1930.',
  'The dot over a lowercase i is called a tittle.',
  "The unicorn is Scotland's national animal.",
  'Saturn is less dense than water.',
  'Lightning is about five times hotter than the surface of the Sun.',
  'Crows can recognise human faces and remember them for years.',
  'Oxford University is older than the Aztec Empire.',
  'The first webcam watched a coffee pot at Cambridge University.',
  'Venus spins the opposite way to most planets.',
  'A teaspoon of neutron star would weigh billions of tonnes.',
  'Bluetooth is named after a 10th-century Danish king.',
  'The QWERTY keyboard layout dates from the 1870s.',
  'Python is named after Monty Python, not the snake.',
  'JavaScript was written in about ten days in 1995.',
  'Git was started by Linus Torvalds in 2005.',
  'The first email was sent in 1971.',
  'Cats sleep for about two-thirds of their lives.',
  'Some turtles can breathe through their rear ends.',
  'Honey kept sealed can stay edible for thousands of years.',
]

/** A fun fact that changes every 20 seconds, or when the person asks for another. */
export const fact = (t: Turn): string => {
  const at = Math.floor(t.elapsedMs / 20_000) + t.factShift + t.startedAt

  return FACTS[Math.abs(at) % FACTS.length] ?? ''
}

/** The words after the spinner's own: the pet, the wait in tea, or the tally, in turn. */
export const spinnerText = (t: Turn): string => {
  const now = stage(t.elapsedMs)
  const counts = tally(t)
  const options = [`${now.pet} ${now.short}`, `≈ ${equivalent(t.elapsedMs)}`]

  if (counts !== '') {
    options.push(counts)
  }

  return options[Math.floor(t.elapsedMs / 6000) % options.length] ?? ''
}

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
  now: '',
  factShift: 0,
  feeds: 0,
})
