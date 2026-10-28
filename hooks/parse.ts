import type { JobKind } from '../types'

export type Progress = {
  percent: number | null
  done: number
  total: number | null
  failed: number
  phase: string
  unit: string
  lastLine: string
}

/** Written to the log (never to the command's own output) when the command ends. */
export const DONE = '__CC_JOB_DONE__'

const DONE_RE = /__CC_JOB_DONE__ (-?\d+)/
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g
const QUOTED = /(["'`])(?:\\.|(?!\1)[^\\])*\1/g

// What may stand before the runner itself: env assignments, npx and friends.
const PREFIX =
  /^(?:\w+=\S*\s+)*(?:(?:npx(?:\s+(?:-y|--yes|--no-install))*|pnpm\s+(?:dlx|exec)|yarn\s+(?:dlx|exec)|bunx|npm\s+exec\s+--|cross-env(?:\s+\w+=\S*)*|time|call)\s+)*/i
const BIN_DIR = /^(?:\.{0,2}[\\/])?(?:node_modules[\\/]\.bin[\\/])/

const TEST_CMD = [
  /^(vitest|jest|mocha|ava|pytest|py\.test|tap)\b/,
  /^python3?\s+-m\s+(pytest|unittest)\b/,
  /^(playwright|cypress)\s+(test|run)\b/,
  /^(cargo|go|dotnet)\s+test\b/,
  /^node\s+(--\S+\s+)*--test\b/,
  /^(npm|pnpm|yarn|bun)\s+(run\s+)?(t|test)(:\S*)?(\s|$)/,
]

const RENDER_CMD = [
  /^remotion\s+(render|still)\b/,
  /^hyperframes\s+render\b/,
  /^(npm|pnpm|yarn|bun)\s+(run\s+)?(render|video|build:video)(:\S*)?(\s|$)/,
]

const IS_QUERY = /(^|\s)(--help|-h|--version|-v|--list-tests|--listTests)(\s|$)/

/** Which kind of long job a shell command starts, if it is one. */
export const detect = (command: string): JobKind | undefined => {
  const bare = command.replace(QUOTED, ' ')

  for (const raw of bare.split(/&&|\|\||[;|\n]/)) {
    const part = raw.trim().replace(PREFIX, '').replace(BIN_DIR, '')

    if (IS_QUERY.test(part)) {
      continue
    }
    if (RENDER_CMD.some(re => re.test(part))) {
      return 'render'
    }
    if (TEST_CMD.some(re => re.test(part))) {
      return 'test'
    }
  }

  return undefined
}

/** The exit code the wrapper wrote at the end of the log, once it has. */
export const exitCode = (raw: string): number | undefined => {
  const found = DONE_RE.exec(raw)

  return found ? Number(found[1]) : undefined
}

/** Output as lines: escape codes gone, and a carriage return starts a new line. */
export const toLines = (raw: string): string[] =>
  raw
    .replace(ANSI, '')
    .replace(/\0/g, '')
    .split(/\r\n|\r|\n/)
    .map(line => line.trimEnd())
    .filter(line => line.trim() !== '' && !line.includes(DONE))

const clamp = (n: number): number => Math.max(0, Math.min(100, n))

const tail = (lines: string[]): string => {
  const last = lines[lines.length - 1]?.trim() ?? ''

  return last.length > 90 ? `${last.slice(0, 89)}…` : last
}

const FRACTION = /(?:^|[^\w./-])(\d{1,7})\s*(?:\/|of)\s*(\d{1,7})(?![\w./-])/
const PERCENT = /(\d{1,3}(?:\.\d+)?)\s*%/

/** Remotion's own lines first, then any percentage or n/m a renderer prints. */
export const parseRender = (lines: string[]): Progress => {
  let rendered: [number, number] | undefined
  let encoded: [number, number] | undefined
  let bundle: number | undefined
  let generic: { percent: number; phase: string; done: number; total: number | null } | undefined

  for (const line of lines) {
    const r = /(Rendered|Rendering(?: frames)?)[^\d\n]{0,60}?(\d+)\s*\/\s*(\d+)/i.exec(line)
    if (r) {
      rendered = [Number(r[2]), Number(r[3])]
    }

    const e = /(Encoded|Encoding|Stitched|Stitching)[^\d\n]{0,60}?(\d+)\s*\/\s*(\d+)/i.exec(line)
    if (e) {
      encoded = [Number(e[2]), Number(e[3])]
    }

    const b = /Bundl\w*[^\d\n]{0,60}?(\d{1,3})\s*%/i.exec(line)
    if (b) {
      bundle = Number(b[1])
    }

    if (!r && !e && !b) {
      const frac = FRACTION.exec(line)
      const pct = PERCENT.exec(line)
      const head = (at: number): string =>
        line.slice(0, at).replace(/[^A-Za-z ]+/g, ' ').trim().slice(-26) || 'Rendering'

      if (frac && Number(frac[2]) >= 2 && Number(frac[1]) <= Number(frac[2])) {
        generic = {
          percent: clamp((Number(frac[1]) / Number(frac[2])) * 100),
          phase: head(frac.index),
          done: Number(frac[1]),
          total: Number(frac[2]),
        }
      } else if (pct) {
        generic = { percent: clamp(Number(pct[1])), phase: head(pct.index), done: 0, total: null }
      }
    }
  }

  const lastLine = tail(lines)

  if (rendered && rendered[1] > 0) {
    const frames = rendered[0] / rendered[1]
    const enc = encoded && encoded[1] > 0 ? encoded[0] / encoded[1] : frames
    const bundled = bundle === undefined ? 1 : bundle / 100
    const isEncoding = encoded !== undefined && rendered[0] >= rendered[1] && enc < 1
    const phase = rendered[0] < rendered[1] ? 'Rendering frames' : isEncoding ? 'Encoding' : 'Finishing'

    return {
      percent: clamp(5 * bundled + 95 * ((frames + enc) / 2)),
      done: rendered[0],
      total: rendered[1],
      failed: 0,
      phase,
      unit: 'frames',
      lastLine,
    }
  }

  if (bundle !== undefined) {
    return { percent: clamp(bundle * 0.05), done: 0, total: null, failed: 0, phase: 'Bundling', unit: '', lastLine }
  }

  if (generic) {
    return {
      percent: generic.percent,
      done: generic.done,
      total: generic.total,
      failed: 0,
      phase: generic.phase,
      unit: generic.total === null ? '' : 'frames',
      lastLine,
    }
  }

  return { percent: null, done: 0, total: null, failed: 0, phase: 'Starting', unit: '', lastLine }
}

const FILE_LINE =
  /^\s{0,3}(✓|√|✔|❯|×|✗|✘|PASS|FAIL)\s+(\S+\.(?:test|spec|tests?)\.\S+|\S+\.(?:py|[cm]?[jt]sx?))\b/

/**
 * Counts what each runner prints as it goes. `expectedTotal` is what the last run
 * of the same command counted, used until the output itself gives a total.
 */
export const parseTest = (lines: string[], expectedTotal: number | null): Progress => {
  const files = new Map<string, boolean>()
  const failedCases = new Set<string>()
  let pwDone = 0
  let pwTotal: number | null = null
  let pyPassed = 0
  let pyFailed = 0
  let pyTotal: number | null = null
  let pyPercent: number | null = null
  let goDone = 0
  let goFailed = 0
  let cargoDone = 0
  let cargoFailed = 0
  let cargoTotal: number | null = null
  let tapDone = 0
  let tapFailed = 0
  let tapTotal: number | null = null
  let summaryTotal: number | null = null

  for (const line of lines) {
    let m: RegExpExecArray | null

    if ((m = /^\s*\[(\d+)\/(\d+)\]/.exec(line))) {
      pwDone = Number(m[1])
      pwTotal = Number(m[2])
    }
    if ((m = /^\s*(\d+)\)\s+\[?\w/.exec(line)) && pwTotal !== null) {
      failedCases.add(m[1] ?? '')
    }

    if ((m = /collected (\d+) items?/.exec(line))) {
      pyTotal = Number(m[1])
    }
    if ((m = /^[\w./\\-]+\.py\s+([.FEsxX]+)/.exec(line))) {
      pyPassed += ((m[1] ?? '').match(/\./g) ?? []).length
      pyFailed += ((m[1] ?? '').match(/[FE]/g) ?? []).length
    }
    if ((m = /\[\s*(\d{1,3})%\]\s*$/.exec(line))) {
      pyPercent = Number(m[1])
    }

    if ((m = FILE_LINE.exec(line))) {
      files.set(m[2] ?? '', /^(❯|×|✗|✘|FAIL)$/.test(m[1] ?? ''))
    }

    if ((m = /^(ok|FAIL)\s+\S+\s+[\d.]+s/.exec(line))) {
      goDone += 1
      goFailed += m[1] === 'FAIL' ? 1 : 0
    }

    if ((m = /^running (\d+) tests?/.exec(line))) {
      cargoTotal = (cargoTotal ?? 0) + Number(m[1])
    }
    if ((m = /^test .+ \.\.\. (ok|FAILED|ignored)/.exec(line))) {
      cargoDone += 1
      cargoFailed += m[1] === 'FAILED' ? 1 : 0
    }

    if ((m = /^(ok|not ok) \d+/.exec(line))) {
      tapDone += 1
      tapFailed += m[1] === 'not ok' ? 1 : 0
    }
    // node --test's spec reporter: one line per case, ending in its time in parentheses.
    if ((m = /^\s*(✔|✖)\s+.+\(\d+(?:\.\d+)?m?s\)\s*$/.exec(line))) {
      tapDone += 1
      tapFailed += m[1] === '✖' ? 1 : 0
    }
    if ((m = /^# tests (\d+)/.exec(line))) {
      tapTotal = Number(m[1])
    }

    if ((m = /Test Files\s+.*\((\d+)\)/.exec(line))) {
      summaryTotal = Number(m[1])
    }
    if ((m = /Test Suites:.*?(\d+) total/.exec(line))) {
      summaryTotal = Number(m[1])
    }
  }

  const fileDone = files.size
  const done = Math.max(pwDone, pyPassed + pyFailed, fileDone, goDone, cargoDone, tapDone)
  const failed = Math.max(
    failedCases.size,
    pyFailed,
    [...files.values()].filter(Boolean).length,
    goFailed,
    cargoFailed,
    tapFailed,
  )
  const total = pwTotal ?? pyTotal ?? cargoTotal ?? tapTotal ?? summaryTotal ?? expectedTotal
  const unit = fileDone > 0 || goDone > 0 ? 'files' : 'tests'
  const lastLine = tail(lines)

  const percent =
    pyPercent ?? (total !== null && total > 0 ? Math.min(99, Math.round((done / total) * 100)) : null)

  return {
    percent: percent === null ? null : clamp(percent),
    done,
    total,
    failed,
    phase: 'Running tests',
    unit,
    lastLine,
  }
}

/** Progress of a log's text, by the kind of job. */
export const parse = (kind: JobKind, raw: string, expectedTotal: number | null): Progress => {
  const lines = toLines(raw)

  return kind === 'render' ? parseRender(lines) : parseTest(lines, expectedTotal)
}
