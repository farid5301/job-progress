import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ToolCallResult } from 'claude-code'

import type { Job, JobStatus, Waiting } from '../types'
import { clock, family, fmt, isTheme, left, parseDuration, pickTheme, quip, themeNames, track as scene } from './fun'
import { DONE, detect, exitCode, parse } from './parse'
import { describeTool, emptyTurn, equivalent, fact, spinnerText, stage, tally, untilNext, walk } from './waiting'

const PANE = 'job-progress'
const KEEP = 12
const MAX_RUN_MS = 3 * 60 * 60 * 1000

// Change the tag when a job's fields change: it declines what an earlier
// version stored, which outlives a reload.
const jobs = atom({ plugin: 'job-progress', key: 'jobs' } as const, [], {
  shape: 'jobs-2',
})

const turn = atom({ plugin: 'job-progress', key: 'turn' } as const, emptyTurn(), { shape: 'turn-1' })

const NO_WAITING: Waiting = { isOn: true, day: '', todayMs: 0, todayTurns: 0, longestMs: 0 }
const waiting = atom({ plugin: 'job-progress', key: 'waiting' } as const, NO_WAITING, { shape: 'waiting-1' })

type History = Record<string, { durationMs: number; total: number | null }>
type Settled = Exclude<JobStatus, 'running'>

const title = (job: Job): string => (job.kind === 'test' ? 'Tests' : 'Render')

const pct = (job: Job): string =>
  job.percent === null ? '' : `${job.isEstimate ? '~' : ''}${Math.round(job.percent)}%`

// The line that says how long is left, and when that lands on the clock.
const remaining = (job: Job): string => {
  const eta = left(job)

  if (eta === undefined) {
    return job.status === 'running' ? 'no time estimate yet, the next run will have one' : ''
  }

  return eta.ms === null ? eta.text : `${eta.text} · done around ${clock(job.startedAt + job.elapsedMs + eta.ms)}`
}

const color = (job: Job): string =>
  job.status === 'passed' ? 'green' : job.status === 'failed' ? 'red' : job.status === 'stopped' ? 'yellow' : 'cyan'

const icon = (job: Job): string =>
  job.status === 'passed' ? '✔' : job.status === 'failed' ? '✖' : job.status === 'stopped' ? '■' : '▶'

const counts = (job: Job): string => {
  const parts: string[] = []

  if (job.total !== null && job.done > 0) {
    parts.push(`${job.done}/${job.total} ${job.unit}`)
  } else if (job.done > 0) {
    parts.push(`${job.done} ${job.unit}`)
  }
  if (job.failed > 0) {
    parts.push(`${job.failed} failed`)
  }

  return parts.join(' · ')
}

const detail = (job: Job): string => {
  const parts = [counts(job)]

  if (job.status === 'running') {
    parts.push(job.phase, `${fmt(job.elapsedMs)} elapsed`)
  } else {
    parts.push(`took ${fmt(job.elapsedMs)}`)
  }

  return parts.filter(part => part !== '').join(' · ')
}

const sh = (text: string): string => `'${text.replace(/'/g, `'\\''`)}'`
const ps = (text: string): string => `'${text.replace(/'/g, "''")}'`

// The command runs as written; its output is also copied to a log this mod
// polls, and its exit code is kept and written to the log's end.
const wrapBash = (command: string, file: string): string =>
  [
    `{ ${command}`,
    `} 2>&1 | tee ${sh(file)}`,
    `__jp=\${PIPESTATUS[0]}`,
    `echo "${DONE} $__jp" >> ${sh(file)}`,
    `exit $__jp`,
  ].join('\n')

const wrapPowerShell = (command: string, file: string): string =>
  [
    `& {`,
    command,
    `} 2>&1 | Tee-Object -FilePath ${ps(file)}`,
    `$__jp = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 0 }`,
    `Add-Content -LiteralPath ${ps(file)} -Value "${DONE} $__jp"`,
    `exit $__jp`,
  ].join('\n')

const tempDir = async ($: EngineInterface): Promise<string> => {
  const dir =
    (await $.env.get('TEMP')) ?? (await $.env.get('TMPDIR')) ?? (await $.env.get('TMP')) ?? '/tmp'

  return dir.replace(/\\/g, '/').replace(/\/$/, '')
}

const findJob = async ($: EngineInterface, id: string): Promise<Job | undefined> =>
  (await read($, jobs)).find(job => job.id === id)

const settle = async ($: EngineInterface, id: string, status: Settled): Promise<void> => {
  const job = await findJob($, id)

  if (job === undefined || job.status !== 'running') {
    return
  }

  const now = await $.clock.now()
  const elapsedMs = now - job.startedAt
  await update($, jobs, list =>
    list.map(one =>
      one.id === id && one.status === 'running'
        ? {
            ...one,
            status,
            endedAt: now,
            elapsedMs,
            isEstimate: false,
            percent: status === 'passed' ? 100 : one.percent,
            phase: status === 'passed' ? 'Done' : status === 'failed' ? 'Failed' : 'Stopped',
          }
        : one,
    ),
  )

  if (status === 'passed') {
    const history = ((await $.store.get('history')) ?? {}) as History
    const entry = { durationMs: elapsedMs, total: job.total ?? (job.done > 0 ? job.done : null) }
    // Forget and re-add, so the newest runs sit last and the oldest are cut first.
    delete history[job.signature]
    delete history[job.family]
    history[job.signature] = entry
    history[job.family] = entry
    const keys = Object.keys(history)
    for (const old of keys.slice(0, Math.max(0, keys.length - 80))) {
      delete history[old]
    }
    await $.store.set('history', history)
  }

  const took = fmt(elapsedMs)
  const text =
    status === 'stopped'
      ? `${title(job)} stopped after ${took}`
      : job.kind === 'test'
        ? status === 'passed'
          ? `Tests passed${job.done > 0 ? ` · ${job.done} ${job.unit}` : ''} · ${took}`
          : `Tests failed${job.failed > 0 ? ` · ${job.failed} failing` : ''} · ${took}`
        : status === 'passed'
          ? `Render finished · ${took}`
          : `Render failed after ${took}`
  $.ui.toast(text, { timeoutMs: 8000 })
}

const poll = async ($: EngineInterface, id: string): Promise<void> => {
  const job = await findJob($, id)

  if (job === undefined || job.status !== 'running') {
    return
  }

  const now = await $.clock.now()
  const elapsedMs = now - job.startedAt
  const text = await $.fs.read(job.file).catch(() => undefined)

  if (text === undefined) {
    await update($, jobs, list =>
      list.map(one => (one.id === id && one.status === 'running' ? { ...one, elapsedMs } : one)),
    )

    return
  }

  const seen = parse(job.kind, text, job.expectedTotal)
  const guess =
    seen.percent === null && job.expectedMs !== null && job.expectedMs > 0
      ? Math.min(95, (elapsedMs / job.expectedMs) * 100)
      : null
  const percent = seen.percent ?? guess
  const isEstimate = seen.percent === null && guess !== null

  await update($, jobs, list =>
    list.map(one => {
      if (one.id !== id || one.status !== 'running') {
        return one
      }
      // A bar only moves forward, unless it was a guess and now has real numbers.
      const next =
        percent === null
          ? one.percent
          : one.isEstimate && !isEstimate
            ? percent
            : Math.max(one.percent ?? 0, percent)

      return {
        ...one,
        elapsedMs,
        percent: next,
        isEstimate: percent === null ? one.isEstimate : isEstimate,
        phase: seen.phase,
        done: seen.done,
        total: seen.total,
        failed: seen.failed,
        unit: seen.unit,
        lastLine: seen.lastLine,
      }
    }),
  )

  const code = exitCode(text)

  if (code !== undefined) {
    await settle($, id, code === 0 ? 'passed' : 'failed')
  } else if (elapsedMs > MAX_RUN_MS) {
    await settle($, id, 'stopped')
  }
}

type ShellCall = { command: string; tool_use_id: string }

let hasOpened = false
let hasOpenedForWait = false

const today = (ms: number): string => {
  const d = new Date(ms)

  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

const startTurn = async ($: EngineInterface, id: string): Promise<void> => {
  const startedAt = await $.clock.now()

  await update($, turn, () => ({ ...emptyTurn(), id, running: true, startedAt }))
}

const tickTurn = async ($: EngineInterface): Promise<void> => {
  const t = await read($, turn)

  if (!t.running) {
    return
  }
  const elapsedMs = (await $.clock.now()) - t.startedAt
  await update($, turn, one => (one.running && one.id === t.id ? { ...one, elapsedMs } : one))

  // A long wait gets the waiting card in view, once a session.
  if (elapsedMs > 45_000 && !hasOpenedForWait && (await read($, waiting)).isOn) {
    hasOpenedForWait = true
    hasOpened = true
    void $.ui.open({ id: PANE, title: 'Progress' })
  }
}

const noteTool = async ($: EngineInterface, tool: string, input: Record<string, unknown>): Promise<void> => {
  if (!(await read($, turn)).running) {
    return
  }
  const { kind, now } = describeTool(tool, input)

  await update($, turn, one => (one.running ? { ...one, [kind]: one[kind] + 1, now } : one))
}

const endTurn = async ($: EngineInterface, id: string, durationMs: number): Promise<void> => {
  const t = await read($, turn)

  if (!t.running || t.id !== id) {
    return
  }
  const now = await $.clock.now()
  const elapsedMs = durationMs > 0 ? durationMs : now - t.startedAt
  await update($, turn, one => (one.id === id ? { ...one, running: false, elapsedMs, now: '' } : one))

  const day = today(now)
  const before = await read($, waiting)
  const fresh = before.day === day ? before : { ...before, day, todayMs: 0, todayTurns: 0, longestMs: 0 }
  const after: Waiting = {
    ...fresh,
    todayMs: fresh.todayMs + elapsedMs,
    todayTurns: fresh.todayTurns + 1,
    longestMs: Math.max(fresh.longestMs, elapsedMs),
  }
  await update($, waiting, () => after)
  await $.store.set('waiting', after)

  if (after.isOn && elapsedMs >= 90_000) {
    $.ui.toast(
      `Claude is done after ${fmt(elapsedMs)}, ${equivalent(elapsedMs)}. Your ${stage(elapsedMs).pet} says hi.`,
      { timeoutMs: 10_000 },
    )
  }
}

const track = async (
  $: EngineInterface,
  e: ShellCall,
  next: (e: any) => Promise<any>,
  shell: 'bash' | 'powershell',
): Promise<ToolCallResult> => {
  const kind = detect(e.command)

  if (kind === undefined) {
    return next(e)
  }

  const id = e.tool_use_id
  const startedAt = await $.clock.now()
  const file = `${await tempDir($)}/claude-job-${id}.log`
  const signature = `${kind}:${e.command.trim().replace(/\s+/g, ' ').slice(0, 200)}`
  const history = ((await $.store.get('history')) ?? {}) as History
  const last = history[signature]
  const kin = family(kind, e.command)
  const similar = last === undefined ? history[kin] : undefined
  const label = e.command.trim().replace(/\s+/g, ' ')
  const theme = pickTheme(kind, id, await $.store.get('theme'))

  const job: Job = {
    id,
    kind,
    label: label.length > 70 ? `${label.slice(0, 69)}…` : label,
    file,
    signature,
    startedAt,
    elapsedMs: 0,
    status: 'running',
    percent: null,
    isEstimate: false,
    phase: 'Starting',
    done: 0,
    total: last?.total ?? null,
    failed: 0,
    unit: kind === 'test' ? 'tests' : 'frames',
    lastLine: '',
    expectedMs: (last ?? similar)?.durationMs ?? null,
    expectedTotal: last?.total ?? null,
    expectedFrom: last !== undefined ? 'same' : similar !== undefined ? 'similar' : null,
    family: kin,
    theme,
  }

  await update($, jobs, list => [...list.filter(one => one.id !== id), job].slice(-KEEP * 2))

  if (!hasOpened) {
    hasOpened = true
    void $.ui.open({ id: PANE, title: 'Progress' })
  }

  const command = shell === 'bash' ? wrapBash(e.command, file) : wrapPowerShell(e.command, file)
  const ran = await next({ ...e, command })

  if (ran.deny !== undefined) {
    await settle($, id, 'stopped')

    return ran
  }

  // A background command returns at once; the poll below sees it end.
  const isBackground = typeof ran.result?.backgroundTaskId === 'string'

  if (!isBackground) {
    await poll($, id)
    await settle(
      $,
      id,
      ran.result?.interrupted === true ? 'stopped' : ran.isError === true ? 'failed' : 'passed',
    )
  }

  return ran
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'jobs',
      description: 'Show the progress of running tests and renders in a pane',
    })

    const saved = (await $.store.get('waiting')) as Partial<Waiting> | undefined
    if (saved !== undefined && saved !== null) {
      await update($, waiting, () => ({ ...NO_WAITING, ...saved }))
    }

    $.clock.every(1000, async () => {
      await tickTurn($)

      const running = (await read($, jobs)).filter(job => job.status === 'running')

      if (running.length === 0) {
        return
      }
      for (const job of running) {
        await poll($, job.id)
      }

      const live = (await read($, jobs)).filter(job => job.status === 'running')
      const latest = live[live.length - 1]
      const eta = latest === undefined ? undefined : left(latest)
      $.ui.status(
        latest === undefined
          ? undefined
          : [title(latest), pct(latest), eta?.text ?? `${fmt(latest.elapsedMs)} elapsed`]
              .filter(part => part !== '')
              .join(' · '),
      )
    })

    return next(e)
  })

  on('command.run', { command: 'jobs' }, async ($, e) => {
    const [sub = '', arg = ''] = e.args.trim().split(/\s+/)

    if (sub === 'theme') {
      if (arg === 'auto' || isTheme(arg)) {
        await $.store.set('theme', arg === 'auto' ? null : arg)

        return { text: `Next jobs will use ${arg === 'auto' ? 'a surprise scene each time' : `the ${arg} scene`}.` }
      }

      return { text: `Pick one: ${themeNames().join(', ')}, or auto.  Usage: /jobs theme rocket` }
    }

    if (sub === 'fun') {
      const isOn = arg !== 'off'
      const after = { ...(await read($, waiting)), isOn }

      await update($, waiting, () => after)
      await $.store.set('waiting', after)

      return {
        text: isOn
          ? 'Waiting is fun again: a pet hatches while Claude works.'
          : 'The waiting pet is off. /jobs fun on brings it back.',
      }
    }

    if (sub === 'eta') {
      const ms = parseDuration(arg)
      const running = (await read($, jobs)).filter(job => job.status === 'running')
      const latest = running[running.length - 1]

      if (ms === undefined || ms <= 0) {
        return { text: 'Tell me how long the running job takes, like /jobs eta 20m (or 1h30m, 45s).' }
      }
      if (latest === undefined) {
        return { text: 'Nothing is running right now.' }
      }
      await update($, jobs, list =>
        list.map(one => (one.id === latest.id ? { ...one, expectedMs: ms, expectedFrom: 'you' } : one)),
      )

      return { text: `Counting down from ${fmt(ms)} for the running ${title(latest).toLowerCase()}.` }
    }

    await $.ui.open({ id: PANE, title: 'Progress' })

    return {
      text: 'Progress pane opened.  /jobs eta 20m sets the time left; /jobs theme rocket changes the scene; /jobs fun off hides the waiting pet.',
    }
  })

  // Claude's own turns, on the main loop: a pet hatches and grows while it works.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      await startTurn($, e.turnId)
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const out = await next(e)

    if (e.agentId === undefined) {
      await endTurn($, e.turnId, e.durationMs)
    }

    return out
  })

  // Counts what Claude does during the turn; the call itself is never changed.
  on('tool.call', async ($, e, next) => {
    await noteTool($, e.tool, e as unknown as Record<string, unknown>).catch(() => undefined)

    return next(e)
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const t = await read($, turn)

    if (!t.running || !(await read($, waiting)).isOn) {
      return next(e)
    }

    return next({ ...e, props: { ...e.props, suffix: `… ${spinnerText(t)}` } })
  })

  // If this mod fails, the command still runs once, as the model wrote it.
  on('tool.call', { tool: 'Bash' }, ($, e, next) => track($, e as ShellCall, next, 'bash')).catch(
    ($, e, next) => next(e),
  )
  on('tool.call', { tool: 'PowerShell' }, ($, e, next) =>
    track($, e as ShellCall, next, 'powershell'),
  ).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, jobs)
    const running = list.filter(job => job.status === 'running').reverse()
    const finished = list.filter(job => job.status !== 'running').reverse().slice(0, KEEP)
    const shown = [...running, ...finished]
    const cells = Math.max(6, Math.min(22, Math.floor(((e.props.bodyColumns ?? 40) - 2) / 2)))

    const t = await read($, turn)
    const w = await read($, waiting)
    const pet = stage(t.elapsedMs).pet
    const soon = untilNext(t.elapsedMs)
    const counts = tally(t)
    const isToday = w.day === today(await $.clock.now()) && w.todayTurns > 0
    const REACTIONS = ['Yum!', 'Burp.', 'More please!', 'It does a little dance.', 'It is getting chubby.']

    const card = !w.isOn ? null : t.running ? (
      <Box key="wait" flexDirection="column">
        <Text>
          <Text bold color="magenta">
            Claude is working
          </Text>
          <Text dimColor> · {fmt(t.elapsedMs)}</Text>
        </Text>
        <Text>{walk(t.elapsedMs, cells)}</Text>
        <Text>
          {stage(t.elapsedMs).line}
          <Text dimColor>{soon === undefined ? '' : `  next: ${soon}`}</Text>
        </Text>
        <Text dimColor>⏱ That's {equivalent(t.elapsedMs)}</Text>
        {counts !== '' && <Text>{counts}</Text>}
        {t.now !== '' && (
          <Text dimColor wrap="truncate-end">
            Now: {t.now}
          </Text>
        )}
        <Text color="yellow">💡 {fact(t)}</Text>
        <Box flexDirection="row" gap={1}>
          <Button
            key="fact"
            label="🥠 New fact"
            onPress={() => update($, turn, one => ({ ...one, factShift: one.factShift + 1 }))}
          />
          <Button
            key="feed"
            label={`🍖 Feed the ${pet}`}
            onPress={() => update($, turn, one => ({ ...one, feeds: one.feeds + 1 }))}
          />
        </Box>
        {t.feeds > 0 && (
          <Text dimColor>
            {pet} {REACTIONS[(t.feeds - 1) % REACTIONS.length]} Fed {t.feeds} {t.feeds === 1 ? 'time' : 'times'}.
          </Text>
        )}
        {isToday && (
          <Text dimColor>
            Today: {w.todayTurns} {w.todayTurns === 1 ? 'turn' : 'turns'}, {fmt(w.todayMs)} of waiting, longest{' '}
            {fmt(w.longestMs)}
          </Text>
        )}
      </Box>
    ) : t.id !== '' ? (
      <Box key="wait" flexDirection="column">
        <Text dimColor>
          Last wait {fmt(t.elapsedMs)}, {equivalent(t.elapsedMs)}. Your {pet} is napping.
        </Text>
        {isToday && (
          <Text dimColor>
            Today: {w.todayTurns} {w.todayTurns === 1 ? 'turn' : 'turns'}, {fmt(w.todayMs)} of waiting
          </Text>
        )}
      </Box>
    ) : null

    if (shown.length === 0 && card === null) {
      return <Text dimColor>Nothing yet. Test runs, renders and Claude's long turns show up here.</Text>
    }

    return (
      <Box flexDirection="column" gap={1}>
        {card}
        {shown.map(job => (
          <Box key={job.id} flexDirection="column">
            <Text>
              <Text color={color(job)} bold>
                {icon(job)} {title(job)}
              </Text>
              <Text dimColor> {job.label}</Text>
            </Text>
            <Text color={color(job)}>{scene(job, cells)}</Text>
            <Text>
              <Text color={color(job)} bold>
                {pct(job)}
              </Text>
              {job.status === 'running' && (
                <Text bold={left(job) !== undefined} dimColor={left(job) === undefined}>
                  {pct(job) === '' ? '' : ' · '}⏳ {remaining(job)}
                </Text>
              )}
            </Text>
            <Text dimColor>{detail(job)}</Text>
            <Text color={color(job)}>{quip(job)}</Text>
            {job.status === 'running' && job.lastLine !== '' && (
              <Text dimColor wrap="truncate-end">
                {job.lastLine}
              </Text>
            )}
          </Box>
        ))}
        {finished.length > 0 && (
          <Button
            key="clear"
            label="Clear finished"
            onPress={() => update($, jobs, all => all.filter(job => job.status === 'running'))}
          />
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const live = (await read($, jobs)).filter(job => job.status === 'running')
    const job = live[live.length - 1]

    if (job === undefined || e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const more = live.length > 1 ? ` (+${live.length - 1} more)` : ''
    const eta = left(job)

    return (
      <Box>
        <Text color={color(job)}>{scene(job, 10)} </Text>
        <Text bold>{[pct(job), eta?.text ?? `${fmt(job.elapsedMs)} elapsed`].filter(part => part !== '').join(' · ')}</Text>
        <Text dimColor>{more}</Text>
      </Box>
    )
  })
}
