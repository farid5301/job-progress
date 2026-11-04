import type { ClientModule, ClientSurface } from 'claude-code'

// Bug Breaker: Breakout to play while Claude works. Drawn in character cells,
// so it runs in the terminal and the desktop pane alike. Until someone moves
// the mouse over it or presses a key, it plays itself.

export type Props = { running: boolean; best: number }

export type Game = {
  w: number
  h: number
  paddle: number
  pw: number
  bx: number
  by: number
  dx: number
  dy: number
  bricks: number[][]
  score: number
  lives: number
  level: number
  phase: 'ready' | 'play' | 'over'
  isDemo: boolean
  message: string
  messageTicks: number
  best: number
  idleTicks: number
}

export const BRICK_W = 4
export const FIELD_H = 12
const TOP = 1

export const ROWS = [
  { name: 'Blocker', color: 'error', points: 40 },
  { name: 'Bug', color: 'claude', points: 30 },
  { name: 'Scope creep', color: 'warning', points: 20 },
  { name: 'Meeting', color: 'success', points: 10 },
] as const

const CHEERS = ['removed', 'squashed', 'contained', 'cancelled']

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n))

const speed = (level: number): number => Math.min(0.9, 0.5 + 0.1 * (level - 1))

// Columns left of the wall, so it sits in the middle of the field.
const margin = (w: number): number => Math.floor((w - (Math.floor(w / BRICK_W) * BRICK_W - 1)) / 2)

const wall = (w: number): number[][] => ROWS.map(() => Array.from({ length: Math.floor(w / BRICK_W) }, () => 1))

const onPaddle = (g: Game): Game => ({ ...g, bx: g.paddle + g.pw / 2, by: g.h - 2, dx: speed(g.level) * 0.6, dy: -speed(g.level) })

export const newGame = (w: number, best: number, isDemo = true): Game => {
  const pw = Math.max(5, Math.floor(w / 5))

  return onPaddle({
    w,
    h: FIELD_H,
    paddle: Math.floor((w - pw) / 2),
    pw,
    bx: 0,
    by: 0,
    dx: 0,
    dy: 0,
    bricks: wall(w),
    score: 0,
    lives: 3,
    level: 1,
    phase: 'ready',
    isDemo,
    message: '',
    messageTicks: 0,
    best,
    idleTicks: 0,
  })
}

const say = (g: Game, message: string): Game => ({ ...g, message, messageTicks: 20 })

/** Launch from the paddle, or start over after a game over. */
export const action = (g: Game): Game => {
  if (g.phase === 'over') {
    return { ...newGame(g.w, Math.max(g.best, g.score), false), phase: 'play' }
  }

  return g.phase === 'ready' ? { ...g, phase: 'play', isDemo: false } : { ...g, isDemo: false }
}

/** The paddle centred under a column, as the mouse moves. */
export const moveTo = (g: Game, x: number): Game => {
  const paddle = clamp(Math.round(x - g.pw / 2), 0, g.w - g.pw)
  const moved = { ...g, paddle, isDemo: false }

  return moved.phase === 'ready' ? onPaddle(moved) : moved
}

export const nudge = (g: Game, cells: number): Game => moveTo(g, g.paddle + g.pw / 2 + cells)

/** One frame: the ball moves, hits what it meets, and the score follows. */
export const step = (g: Game): Game => {
  let n: Game = { ...g, messageTicks: Math.max(0, g.messageTicks - 1) }

  if (n.isDemo) {
    // The demo player keeps its paddle a little off centre under the ball.
    const target = clamp(n.bx - n.pw / 2 + (n.dx > 0 ? 1 : -1), 0, n.w - n.pw)
    n = { ...n, paddle: clamp(n.paddle + clamp(target - n.paddle, -1.5, 1.5), 0, n.w - n.pw) }
  }
  if (n.phase === 'over') {
    n = { ...n, idleTicks: n.idleTicks + 1 }

    return n.isDemo && n.idleTicks > 30 ? newGame(n.w, n.best) : n
  }
  if (n.phase === 'ready') {
    n = onPaddle({ ...n, idleTicks: n.idleTicks + 1 })

    return n.isDemo && n.idleTicks > 8 ? { ...n, phase: 'play', idleTicks: 0 } : n
  }

  let x = n.bx + n.dx
  let y = n.by + n.dy
  let { dx, dy } = n

  if (x < 0) {
    x = -x
    dx = -dx
  } else if (x > n.w - 1) {
    x = 2 * (n.w - 1) - x
    dx = -dx
  }
  if (y < 0) {
    y = -y
    dy = -dy
  }

  const row = Math.floor(y) - TOP
  const from = x - margin(n.w)
  const col = from < 0 ? -1 : Math.floor(from / BRICK_W)
  const kind = ROWS[row]

  if (kind !== undefined && n.bricks[row]?.[col] === 1) {
    const bricks = n.bricks.map((one, r) => (r === row ? one.map((b, c) => (c === col ? 0 : b)) : one))
    const points = kind.points * n.level
    n = say({ ...n, bricks, score: n.score + points }, `${kind.name} ${CHEERS[row] ?? 'cleared'}! +${points}`)
    dy = -dy
    y = n.by

    if (bricks.every(one => one.every(b => b === 0))) {
      const level = n.level + 1

      return say(onPaddle({ ...n, level, bricks: wall(n.w), phase: 'ready', idleTicks: 0 }), `Sprint ${n.level} done! On to sprint ${level}`)
    }
  }

  const paddleRow = n.h - 1
  if (dy > 0 && y >= paddleRow - 0.5) {
    if (x >= n.paddle - 0.5 && x <= n.paddle + n.pw + 0.5) {
      const off = clamp((x - (n.paddle + n.pw / 2)) / (n.pw / 2), -1, 1)
      const s = speed(n.level)
      dx = Math.abs(off) < 0.2 ? (off < 0 ? -0.25 : 0.25) * s * 2 : off * s * 1.6
      dy = -s
      y = paddleRow - 1
    } else if (y > paddleRow) {
      const lives = n.lives - 1

      if (lives <= 0) {
        return say({ ...n, lives: 0, phase: 'over', best: Math.max(n.best, n.score), idleTicks: 0 }, 'Game over. Deadline missed.')
      }

      return say(onPaddle({ ...n, lives, phase: 'ready', idleTicks: 0 }), `Missed! ${lives} ${lives === 1 ? 'life' : 'lives'} left`)
    }
  }

  return { ...n, bx: x, by: y, dx, dy }
}

type Cell = { ch: string; color?: string }

/** The field as rows of cells: bricks, ball and paddle. */
export const cells = (g: Game): Cell[][] => {
  const grid: Cell[][] = Array.from({ length: g.h }, () => Array.from({ length: g.w }, () => ({ ch: ' ' })))

  g.bricks.forEach((one, r) => {
    const kind = ROWS[r]
    one.forEach((b, c) => {
      for (let i = 0; i < BRICK_W - 1; i++) {
        const cell = grid[r + TOP]?.[margin(g.w) + c * BRICK_W + i]
        if (b === 1 && cell !== undefined && kind !== undefined) {
          cell.ch = '█'
          cell.color = kind.color
        }
      }
    })
  })
  for (let i = 0; i < g.pw; i++) {
    const cell = grid[g.h - 1]?.[Math.round(g.paddle) + i]
    if (cell !== undefined) {
      cell.ch = '▀'
      cell.color = 'suggestion'
    }
  }
  const ball = grid[clamp(Math.floor(g.by), 0, g.h - 1)]?.[clamp(Math.round(g.bx), 0, g.w - 1)]
  if (ball !== undefined && g.phase !== 'over') {
    ball.ch = '●'
    ball.color = 'text'
  }

  return grid
}

// Each instance's newest props, for the frame clock to read.
const latest = new WeakMap<object, Props>()

const tick = (surface: ClientSurface<Game>): void => {
  const g = surface.state
  const props = latest.get(surface)

  if (g === undefined) {
    return
  }
  // Nobody is playing and Claude is done: hold still instead of burning frames.
  if (props !== undefined && !props.running && g.isDemo) {
    return
  }
  const w = Math.max(16, surface.columns - 2)
  if (surface.columns > 0 && w !== g.w) {
    surface.setState(newGame(w, g.best, g.isDemo))

    return
  }
  const next = step(g)
  if (next.phase === 'over' && g.phase !== 'over' && !g.isDemo && next.score > (props?.best ?? 0)) {
    surface.post({ best: next.score })
  }
  surface.setState(next)
}

const Breakout: ClientModule<Props, Game> = (props, surface) => {
  const { Box, Text } = surface.elements
  latest.set(surface, props)

  let g = surface.state
  if (g === undefined) {
    g = newGame(Math.max(16, (surface.columns || 34) - 2), props.best)
    surface.setState(g)
    surface.every(100, () => tick(surface))
    surface.onPointer(ev => {
      const now = surface.state
      if (now === undefined) {
        return
      }
      if (ev.type === 'move') {
        surface.setState(moveTo(now, ev.x - 1))
      } else if (ev.type === 'down') {
        surface.setState(action(moveTo(now, ev.x - 1)))
      }
    })
    surface.onKey(ev => {
      const now = surface.state
      if (now === undefined) {
        return
      }
      if (ev.key === 'left' || ev.key === 'a') {
        surface.setState(nudge(now, -3))
      } else if (ev.key === 'right' || ev.key === 'd') {
        surface.setState(nudge(now, 3))
      } else if (ev.key === ' ' || ev.key === 'space' || ev.key === 'return') {
        surface.setState(action(now))
      }
    })
  }

  const best = Math.max(props.best, g.best, g.score)
  const rows = cells(g).map((row, r) => {
    // Runs of one colour become one Text, to keep the tree small.
    const runs: Cell[] = []
    for (const cell of row) {
      const last = runs[runs.length - 1]
      if (last !== undefined && last.color === cell.color) {
        last.ch += cell.ch
      } else {
        runs.push({ ...cell })
      }
    }

    return (
      <Text key={`r${r}`} mono>
        {runs.map((run, i) => (
          <Text key={`c${i}`} color={run.color}>
            {run.ch}
          </Text>
        ))}
      </Text>
    )
  })

  const hint =
    g.messageTicks > 0
      ? g.message
      : g.phase === 'over'
        ? `Game over at ${g.score}. Click or press space to try again`
        : g.isDemo
          ? 'Demo mode: move the mouse here, or click and use ← →'
          : g.phase === 'ready'
            ? 'Click or press space to launch'
            : '← → or the mouse moves the paddle'

  return (
    <Box flexDirection="column">
      <Text mono>
        <Text bold color="claude">
          SCORE {String(g.score).padStart(4, '0')}
        </Text>
        <Text color="error"> {'♥'.repeat(g.lives)}</Text>
        <Text color="subtle">{'♡'.repeat(Math.max(0, 3 - g.lives))}</Text>
        <Text color="suggestion"> SPRINT {g.level}</Text>
        <Text color="subtle"> BEST {best}</Text>
      </Text>
      <Box borderStyle="round" borderColor="subtle" flexDirection="column">
        {rows}
      </Box>
      {!props.running && (
        <Text bold color="success">
          ✓ Claude is done. Back to work!
        </Text>
      )}
      <Text color={g.messageTicks > 0 ? 'claude' : 'subtle'} wrap="truncate-end">
        {hint}
      </Text>
    </Box>
  )
}

export default Breakout
