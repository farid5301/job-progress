// While Claude works, a buddy keeps you company: a big ASCII character that
// acts out what Claude is doing (reading a book, typing on a laptop, watching
// a terminal, searching with a magnifier, spinning a globe), blinks, fidgets,
// jumps when a tool call fails, and says what is going on in a speech bubble.
//
// Everything is plain ASCII on a stage of fixed size: every row is exactly
// STAGE_W columns and there are always STAGE_ROWS rows, so nothing around it
// moves as it animates.

export const STAGE_W = 32
const CHAR_W = 12
const PROP_W = STAGE_W - CHAR_W
const BODY_ROWS = 6

type Species = {
  id: string
  name: string
  /** For the spinner line, where an emoji fits. */
  emoji: string
  color: string
  /** Two frames; `$` marks the eyes. */
  frames: [string[], string[]]
  line: string
}

const art = (text: string): string[] => text.split('\n').slice(1)

const SPECIES: Species[] = [
  {
    id: 'cat',
    name: 'Mochi the cat',
    emoji: '🐱',
    color: 'claude',
    frames: [
      art(String.raw`
 /\_/\
( $.$ )
 > ^ <
 /   \  )
(_| |_)/`),
      art(String.raw`
 /\_/\
( $.$ )
 > ^ <
 /   \   )
(_| |_)_/`),
    ],
    line: 'Purr-fect so far.',
  },
  {
    id: 'robot',
    name: 'Bolt the robot',
    emoji: '🤖',
    color: 'subtle',
    frames: [
      art(String.raw`
   _|_
  [$ $]
  |_=_|
 /|___|\
  _| |_`),
      art(String.raw`
   _*_
  [$ $]
  |_-_|
 \|___|/
  _| |_`),
    ],
    line: 'Beep. Working. Boop.',
  },
  {
    id: 'owl',
    name: 'Hoot the owl',
    emoji: '🦉',
    color: 'permission',
    frames: [
      art(String.raw`
  ,___,
  ($v$)
  /)  )
 --"-"--`),
      art(String.raw`
  ,___,
  ($v$)
  (  (\
 --"-"--`),
    ],
    line: 'Whooo wrote all this?',
  },
  {
    id: 'penguin',
    name: 'Pip the penguin',
    emoji: '🐧',
    color: 'suggestion',
    frames: [
      art(String.raw`
   .-"-.
  / $ $ \
  \  v  /
  /'---'\
  ^^   ^^`),
      art(String.raw`
   .-"-.
  / $ $ \
  \  v  /
 _/'---'\_
  ^^   ^^`),
    ],
    line: 'Sliding right along.',
  },
  {
    id: 'frog',
    name: 'Ribbit the frog',
    emoji: '🐸',
    color: 'success',
    frames: [
      art(String.raw`
  _     _
 ($)---($)
(  _____  )
 \_______/
  ^^   ^^`),
      art(String.raw`
  _     _
 ($)---($)
(  \___/  )
 \_______/
  ^^   ^^`),
    ],
    line: 'Hopping between files.',
  },
  {
    id: 'bunny',
    name: 'Clover the bunny',
    emoji: '🐰',
    color: 'text',
    frames: [
      art(String.raw`
 (\(\
 ( $.$)
 o_(")(")`),
      art(String.raw`
 (\ /)
 ( $.$)
 o_(")(")`),
    ],
    line: 'Nibbling through the work.',
  },
  {
    id: 'dog',
    name: 'Biscuit the dog',
    emoji: '🐶',
    color: 'warning',
    frames: [
      art(String.raw`
  / \__
 (    $\___
 /         O
/   (_____/
/_____/   U`),
      art(String.raw`
  / \__
 (    $\___
 /         o
/   (_____/
/_____/  U`),
    ],
    line: 'Good code! Good code!',
  },
]

export const buddyIds = SPECIES.map(one => one.id)

export const isBuddy = (id: string): boolean => buddyIds.includes(id)

const hash = (text: string): number => [...text].reduce((h, ch) => (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0, 7)

/** The buddy for a turn: the person's pick, or a different face from turn to turn. */
export const pickBuddy = (turnId: string, pinned: string): Species =>
  SPECIES.find(one => one.id === pinned) ?? (SPECIES[hash(turnId) % SPECIES.length] as Species)

/** What the buddy is acting out. */
export type Pose =
  | 'thinking'
  | 'reads'
  | 'edits'
  | 'commands'
  | 'searches'
  | 'web'
  | 'helpers'
  | 'other'
  | 'oops'
  | 'done'
  | 'stopped'
  | 'failed'

const SNIPPETS = ['fix()', 'x = 1', 'if ok', 'ship!', 'test()', '// hm']

const GLOBE = ': .:. .:  .: ..'

const spin = (pattern: string, offset: number, n: number): string =>
  Array.from({ length: n }, (_x, i) => pattern[(i + offset) % pattern.length] ?? ' ').join('')

/** The prop beside the buddy, for this frame. Rows sit on the floor. */
const prop = (pose: Pose, f: number, ms: number): string[] => {
  switch (pose) {
    case 'reads': {
      const at = f % 4
      const page = (row: number, side: number): string => (at === row * 2 + side ? '>~~' : '~~~')

      return ['  ____ ____', ` |${page(0, 0)} |${page(0, 1)} |`, ` |${page(1, 0)} |${page(1, 1)} |`, ' |____|____|']
    }
    case 'edits': {
      const snippet = SNIPPETS[Math.floor(f / 8) % SNIPPETS.length] ?? ''
      const typed = snippet.slice(0, f % 8) + (f % 2 === 0 ? '_' : ' ')

      return [
        '  ________',
        ` | ${typed.slice(0, 6).padEnd(6)} |`,
        ' |        |',
        ' |________|',
        f % 2 === 0 ? '/_::::::::_\\' : '/_:.::.:::_\\',
      ]
    }
    case 'commands': {
      const bar = '#'.repeat(f % 6).padEnd(5)

      return [' .---------.', ` | $ run ${'|/-\\'[f % 4]} |`, ` | [${bar.slice(0, 5)}] |`, " '---------'"]
    }
    case 'searches': {
      const x = ' '.repeat(f % 6)

      return [`${x}  .-.`, `${x} ( o )`, `${x}  '-'\\`, ' . ? . . ? . .']
    }
    case 'web':
      return ['   .---.', `  / ${spin(GLOBE, f, 3)} \\`, ` | ${spin(GLOBE, f + 4, 5)} |`, `  \\ ${spin(GLOBE, f + 9, 3)} /`, "   '---'"]
    case 'helpers':
      return f % 2 === 0 ? ['   hi!', '  (^.^)/', '  /| |', '   / \\'] : ['   hi!', ' \\(^.^)', '   | |\\', '   / \\']
    case 'other':
      return ['', '   .-=-.', `  ( (${'-\\|/'[f % 4]}) )`, "   '-=-'"]
    case 'oops':
      return ['  oops!', '    /\\', f % 2 === 0 ? '   /!!\\' : '   /  \\', '  /____\\']
    case 'done':
      return ['  *   .   *', ' .  yay!  +', "  +   '  .", '   *  .   *']
    case 'stopped':
      return ['', '      z', '     Z', '    z']
    case 'failed':
      return ['', '   ?', '  ?!', '']
    case 'thinking': {
      // A long think gets a cup of coffee every other while.
      if (ms > 5 * 60_000 && Math.floor(ms / 10_000) % 2 === 1) {
        return [f % 2 === 0 ? '    ( (' : '     ) )', f % 2 === 0 ? '     ) )' : '    ( (', '  .______.', '  |      |]', '  \\______/']
      }
      const k = f % 5
      const cloud = ['?', '!', '...'][Math.floor(f / 5) % 3] ?? '?'

      // A dot, then o, then O rise from the buddy's head, then the thought cloud.
      return [
        k >= 3 ? '     .------.' : '',
        k >= 3 ? `   O (  ${cloud.padEnd(3)} )` : k >= 2 ? '   O' : '',
        k >= 3 ? "  o  '------'" : k >= 1 ? '  o' : '',
        ' .',
      ]
    }
  }
}

const eyesFor = (pose: Pose, f: number): string => {
  if (pose === 'oops') {
    return 'O'
  }
  if (pose === 'done' || pose === 'helpers') {
    return '^'
  }
  if (pose === 'stopped') {
    return '-'
  }
  if (pose === 'failed') {
    return 'x'
  }

  return f % 9 === 0 ? '-' : 'o'
}

const cut = (text: string, n: number): string => {
  const chars = [...text]

  return chars.length > n ? `${chars.slice(0, n - 1).join('')}…` : text + ' '.repeat(n - chars.length)
}

/** Sits a block on the floor of `rows` rows, `lift` rows up. */
const floor = (block: string[], rows: number, lift = 0): string[] => {
  const body = block.slice(-rows + lift)
  const top = rows - body.length - lift

  return [...Array.from({ length: Math.max(0, top) }, () => ''), ...body, ...Array.from({ length: lift }, () => '')]
}

// Spaces become no-break spaces, so a surface neither folds nor collapses them.
const hold = (text: string): string => text.replace(/ /g, '\u00a0')

export type Part = { text: string; color?: string; italic?: boolean }
export type StageRow = Part[]

/**
 * The buddy at this moment: a speech bubble of two lines over the buddy and its
 * prop. Always STAGE_ROWS rows of STAGE_W columns.
 */
export const stage = (opts: {
  buddy: Species
  pose: Pose
  /** Moves the animation; a still stage passes 0 and never blinks or bobs. */
  ms: number
  isStill?: boolean
  say: string
  quip: string
}): StageRow[] => {
  const f = opts.isStill === true ? 1 : Math.floor(opts.ms / 500)
  const { buddy, pose } = opts
  const eyes = eyesFor(pose, f)
  const frame = (opts.isStill === true ? buddy.frames[0] : buddy.frames[Math.floor(f / 2) % 2]) ?? buddy.frames[0]
  // Only a fright makes the buddy jump; the rest of the time it stays put, so the eye can rest.
  const lift = opts.isStill !== true && pose === 'oops' && f % 2 === 1 ? 1 : 0
  const body = floor(
    frame.map(row => row.replace(/\$/g, eyes)),
    BODY_ROWS,
    lift,
  )
  const thing = floor(prop(pose, f, opts.ms), BODY_ROWS)
  const inner = STAGE_W - 6

  const bubble: StageRow[] = [
    [{ text: hold(` .${'-'.repeat(STAGE_W - 4)}. `), color: 'subtle' }],
    [{ text: hold(' | '), color: 'subtle' }, { text: hold(cut(opts.say, inner)) }, { text: hold(' | '), color: 'subtle' }],
    [
      { text: hold(' | '), color: 'subtle' },
      { text: hold(cut(opts.quip, inner)), color: 'subtle', italic: true },
      { text: hold(' | '), color: 'subtle' },
    ],
    [{ text: hold(` '---v${'-'.repeat(STAGE_W - 8)}' `), color: 'subtle' }],
  ]

  const propColor = pose === 'oops' || pose === 'failed' ? 'warning' : pose === 'done' ? 'success' : 'suggestion'

  return [
    ...bubble,
    ...body.map((row, i) => [
      { text: hold(cut(row, CHAR_W)), color: buddy.color },
      { text: hold(cut(thing[i] ?? '', PROP_W)), color: propColor },
    ]),
  ]
}

export const STAGE_ROWS = 4 + BODY_ROWS

const TIERS: { from: number; lines: string[] }[] = [
  { from: 0, lines: ['Ooh, a new task!', "Let's do this.", 'Warming up...'] },
  { from: 60_000, lines: ['Making good progress.', "Stretch? I'll keep watch.", 'Good time for water.'] },
  { from: 5 * 60_000, lines: ['This is a big one.', 'Still on it, promise.', 'Go grab a snack.'] },
  { from: 15 * 60_000, lines: ['Marathon mode.', "Take a walk, I'll ping you.", 'Worth the wait, I hope.'] },
]

const KIND_LINES: Partial<Record<Pose, string>> = {
  thinking: 'Thinking hard...',
  reads: 'So much to read.',
  edits: 'Typing furiously.',
  commands: 'Watching the output.',
  searches: 'Looking for clues.',
  web: 'Surfing the web.',
  helpers: 'Called in a friend.',
  other: 'Tinkering away.',
}

/** What the buddy says on the bubble's second line, changing every 8 seconds. */
export const quip = (buddy: Species, pose: Pose, ms: number): string => {
  if (pose === 'oops') {
    return 'Ouch. Claude will retry.'
  }
  const tier = [...TIERS].reverse().find(one => ms >= one.from) ?? TIERS[0]
  const lines = [...(tier?.lines ?? []), buddy.line, KIND_LINES[pose] ?? '']
  const pick = lines[Math.floor(ms / 8000) % lines.length] ?? ''

  return pick
}

const VERBS: Record<Pose, string> = {
  thinking: 'is thinking',
  reads: 'is reading along',
  edits: 'is typing',
  commands: 'watches the terminal',
  searches: 'is hunting for clues',
  web: 'surfs the web',
  helpers: 'called a friend',
  other: 'is tinkering',
  oops: 'says oops',
  done: 'is done',
  stopped: 'stopped',
  failed: 'is puzzled',
}

/** "🐱 Mochi is typing", for the spinner line. */
export const doing = (buddy: Species, pose: Pose): string =>
  `${buddy.emoji} ${buddy.name.split(' ')[0]} ${VERBS[pose]}`
