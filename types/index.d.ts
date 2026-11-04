export type JobKind = 'test' | 'render'

export type JobStatus = 'running' | 'passed' | 'failed' | 'stopped'

export type Job = {
  id: string
  kind: JobKind
  /** The command as the model wrote it, cut for display. */
  label: string
  /** Where the wrapped command tees its output; polled while it runs. */
  file: string
  /** Key of this command in the stored run history. */
  signature: string
  startedAt: number
  endedAt?: number
  elapsedMs: number
  status: JobStatus
  /** 0-100, or null while nothing in the output says how far along it is. */
  percent: number | null
  /** True when `percent` is a guess from how long the last run took. */
  isEstimate: boolean
  phase: string
  done: number
  total: number | null
  failed: number
  unit: string
  lastLine: string
  /** How long the previous run of the same command took, if one is stored. */
  expectedMs: number | null
  /** What the previous run counted, to give a test run a total up front. */
  expectedTotal: number | null
  /** Where `expectedMs` came from: this exact command, a similar one, or the person. */
  expectedFrom: 'same' | 'similar' | 'you' | null
  /** Key of this command's tool and folder in the stored run history. */
  family: string
  /** Name of the scene drawn for this job's track. */
  theme: string
}

/** Claude's current (or last) turn on the main loop, as the waiting card draws it. */
export type Turn = {
  id: string
  running: boolean
  startedAt: number
  elapsedMs: number
  reads: number
  edits: number
  commands: number
  searches: number
  web: number
  helpers: number
  other: number
  /** Tool calls that came back as errors. */
  errors: number
  /** Files edited this turn, newest first. */
  files: string[]
  /** A few words on the latest tool call. */
  now: string
  /** The kind of tool running right now, or "" while Claude thinks between tools. */
  kind: string
  /** When the latest failed tool call came back, in ms into the turn; -1 for none. */
  errorAtMs: number
  /** Why the turn ended: answer, aborted, error or refusal; "" while it runs. */
  reason: string
  /** Tokens the turn used, once it has ended. */
  tokens: number
}

/** The person's switch and today's waiting, kept in the store too. */
export type Waiting = {
  isOn: boolean
  day: string
  todayMs: number
  todayTurns: number
  longestMs: number
  /** The buddy the person picked, or "" for a different one each turn. */
  buddy: string
  /** True to keep the buddy still, for people who prefer less motion. */
  isStill: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'job-progress': { jobs: Shaped<Job[]>; turn: Shaped<Turn>; waiting: Shaped<Waiting>; factClock: Shaped<number> }
  }
}
