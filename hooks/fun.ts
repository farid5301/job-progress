import type { Job, JobKind } from '../types'

// Every cell of a track is two terminal columns wide (an emoji, or a narrow
// glyph plus a space), so the line keeps its width as the head moves.
type Theme = {
  head: [string, string]
  behind?: [string, string]
  chaser?: string
  ahead: string
  trail: string
  goal: string
  quips: string[]
}

const THEMES: Record<string, Theme> = {
  rocket: {
    head: ['🚀', '🚀'],
    behind: ['🔥', '💨'],
    ahead: '· ',
    trail: '  ',
    goal: '🌕',
    quips: ['Houston, we have frames', 'Counting down to orbit', 'Rocket fuel: electricity and hope', 'Passing the asteroid belt'],
  },
  racecar: {
    head: ['🚗', '🚙'],
    behind: ['💨', '💨'],
    ahead: '- ',
    trail: '= ',
    goal: '🏁',
    quips: ['Taking the corners at 60 fps', 'Pit stop? No time', 'Foot on the pedal', 'Overtaking the other renders'],
  },
  pizza: {
    head: ['😋', '🤤'],
    ahead: '🍕',
    trail: '  ',
    goal: '🎉',
    quips: ['Nom nom nom', 'Frames taste better with cheese', 'One slice at a time', 'Save me a slice'],
  },
  turtle: {
    head: ['🐢', '🐢'],
    ahead: '. ',
    trail: '. ',
    goal: '🏁',
    quips: ['Slow and steady wins the render', 'No rush, the turtle knows the way', 'The hare is still asleep', 'Patience, pixels in progress'],
  },
  pacman: {
    head: ['ᗧ ', '● '],
    chaser: '👻',
    ahead: '• ',
    trail: '  ',
    goal: '🍒',
    quips: ['Waka waka waka', 'Eating tests before the ghost does', 'Munching through the suite', 'Power pellet incoming'],
  },
  bugs: {
    head: ['🔨', '💥'],
    ahead: '🐛',
    trail: '✨',
    goal: '🏆',
    quips: ['Whack-a-bug in progress', 'No bug left behind', 'Squashing them one by one', 'Bugs hate this one trick'],
  },
  bunny: {
    head: ['🐇', '🐰'],
    ahead: '🥕',
    trail: '  ',
    goal: '🏡',
    quips: ['Hopping through the test cases', 'Carrot-fuelled QA', 'Nibble, nibble, green checks', 'What is up, tests?'],
  },
}

const POOL: Record<JobKind, string[]> = {
  render: ['rocket', 'racecar', 'pizza', 'turtle'],
  test: ['pacman', 'bugs', 'bunny'],
}

export const themeNames = (): string[] => Object.keys(THEMES)

export const isTheme = (name: string): boolean => Object.prototype.hasOwnProperty.call(THEMES, name)

const hash = (text: string): number => {
  let n = 0

  for (let i = 0; i < text.length; i++) {
    n = (n * 31 + text.charCodeAt(i)) >>> 0
  }

  return n
}

/** The theme a new job gets: the one the person picked, else one by the job's id. */
export const pickTheme = (kind: JobKind, id: string, preferred: unknown): string => {
  if (typeof preferred === 'string' && isTheme(preferred)) {
    return preferred
  }
  const pool = POOL[kind]

  return pool[hash(id) % pool.length] ?? 'rocket'
}

const themeOf = (job: Job): Theme => THEMES[job.theme] ?? (THEMES[POOL[job.kind][0] ?? 'rocket'] as Theme)

const bounce = (frame: number, span: number): number => {
  if (span <= 0) {
    return 0
  }
  const at = frame % (span * 2)

  return at <= span ? at : span * 2 - at
}

/** A little scene: the head runs along the track as the job does. */
export const track = (job: Job, cells: number): string => {
  const t = themeOf(job)
  const n = Math.max(4, cells)
  const last = n - 1
  const frame = Math.floor(job.elapsedMs / 1000)

  if (job.status === 'passed') {
    return t.trail.repeat(last) + '🎉'
  }

  const unknown = job.percent === null
  const pos = unknown
    ? bounce(frame, last - 1)
    : Math.min(last - 1, Math.floor(((job.percent ?? 0) / 100) * last))
  const head =
    job.status === 'failed' ? '💥' : job.status === 'stopped' ? '🛑' : t.head[frame % 2] ?? t.head[0]
  const behind = t.behind?.[frame % 2]
  const out: string[] = []

  for (let i = 0; i < last; i++) {
    if (i === pos) {
      out.push(head)
    } else if (i < pos && !unknown) {
      out.push(i === pos - 1 && behind !== undefined ? behind : i === pos - 2 && t.chaser !== undefined ? t.chaser : t.trail)
    } else {
      out.push(t.ahead)
    }
  }
  out.push(t.goal)

  return out.join('')
}

const QUIPS: Record<JobKind, string[]> = {
  render: ['Teaching pixels to dance', 'Bribing the GPU with electricity', 'Counting frames so you do not have to', 'Convincing ffmpeg to be nice', 'Rendering at the speed of patience'],
  test: ['Poking your code with a stick', 'Interrogating every function', 'Looking for bugs under the couch', 'Checking nothing is on fire', 'Asking the code politely'],
}

/** A line that changes every few seconds, themed to the job and where it is. */
export const quip = (job: Job): string => {
  const t = themeOf(job)

  if (job.status === 'passed') {
    return job.kind === 'test' ? 'All green. Go celebrate.' : 'Fresh out of the oven. Go watch it.'
  }
  if (job.status === 'failed') {
    return job.kind === 'test' ? 'The bugs fought back.' : 'The render hit a wall.'
  }
  if (job.status === 'stopped') {
    return 'Stopped before the finish line.'
  }
  if (job.percent !== null && job.percent >= 90) {
    return 'Almost there, do not blink'
  }
  const all = [...t.quips, ...QUIPS[job.kind]]
  const turn = Math.floor(job.elapsedMs / 8000) + hash(job.id)

  return `${all[turn % all.length] ?? ''}…`
}

export const fmt = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  const sec = String(s % 60).padStart(2, '0')

  if (s >= 3600) {
    return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${sec}`
  }

  return `${Math.floor(s / 60)}:${sec}`
}

export const clock = (ms: number): string => {
  const d = new Date(ms)
  const h = d.getHours()

  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

export type Left = { text: string; ms: number | null }

/** How long is left, from the real percentage if there is one, else from the last run. */
export const left = (job: Job): Left | undefined => {
  if (job.status !== 'running') {
    return undefined
  }
  if (!job.isEstimate && job.percent !== null && job.percent >= 3 && job.elapsedMs > 3000) {
    const ms = (job.elapsedMs * (100 - job.percent)) / job.percent

    return { text: `~${fmt(ms)} left`, ms }
  }
  if (job.expectedMs !== null) {
    const ms = job.expectedMs - job.elapsedMs

    if (ms > 0) {
      return { text: `~${fmt(ms)} left${job.expectedFrom === 'similar' ? ' (rough)' : ''}`, ms }
    }

    return { text: `taking longer than the last run (${fmt(job.expectedMs)})`, ms: null }
  }

  return undefined
}

/** The command's own folder and tool, so a similar run can stand in for an unseen one. */
export const family = (kind: JobKind, command: string): string => {
  const dir = /(?:^|[;&\n]\s*)cd\s+("[^"]+"|'[^']+'|[^\s;&|]+)/.exec(command)?.[1] ?? ''
  const tool =
    /\b(remotion|hyperframes|vitest|jest|mocha|playwright|pytest|cargo|dotnet|go|npm|pnpm|yarn|bun|node)\b/.exec(
      command,
    )?.[1] ?? ''

  return `family:${kind}:${tool}:${dir.replace(/^["']|["']$/g, '')}`
}

/** "90", "20m", "1h30m", "45s" to milliseconds. */
export const parseDuration = (text: string): number | undefined => {
  const m = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/i.exec(text.trim())

  if (m !== null && (m[1] ?? m[2] ?? m[3]) !== undefined) {
    return (Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)) * 1000
  }
  const bare = /^(\d+(?:\.\d+)?)$/.exec(text.trim())

  return bare === null ? undefined : Number(bare[1]) * 60 * 1000
}
