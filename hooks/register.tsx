import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ToolCallResult } from 'claude-code'

import type { Job, JobStatus } from '../types'
import { clock, family, fmt, isTheme, left, parseDuration, pickTheme, quip, themeNames, track as scene } from './fun'
import { DONE, detect, exitCode, parse } from './parse'

const PANE = 'job-progress'
const KEEP = 12
const MAX_RUN_MS = 3 * 60 * 60 * 1000

// Change the tag when a job's fields change: it declines what an earlier
// version stored, which outlives a reload.
const jobs = atom({ plugin: 'job-progress', key: 'jobs' } as const, [], {
  shape: 'jobs-2',
})

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

    $.clock.every(1000, async () => {
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

    return { text: 'Progress pane opened.  /jobs eta 20m sets the time left; /jobs theme rocket changes the scene.' }
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

    if (shown.length === 0) {
      return <Text dimColor>No test run or render yet. They show up here while they run.</Text>
    }

    return (
      <Box flexDirection="column" gap={1}>
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
