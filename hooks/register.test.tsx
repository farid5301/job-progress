import { expect, mock, test } from 'claude-code/testing'

import { pickBuddy } from './buddy'

const PANE = {
  plugin: 'job-progress',
  component: 'Pane',
  requestId: 'job-progress',
  props: {
    title: 'Progress',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const RAN = { stdout: '', stderr: '', interrupted: false } as const

test('a test run is wrapped, followed to its end, and shown on every surface', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  mock.env(on, { TEMP: 'C:\\Temp' })

  let sent = ''
  on('command.register', () => ({ value: { command: 'jobs' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', (_, e) => {
    sent = String((e as { command?: string }).command)

    return { result: RAN }
  })
  on('fs.read', () => ({
    value: ' ✓ src/a.test.ts (3 tests) 10ms\n ✓ src/b.test.ts (2 tests) 8ms\n__CC_JOB_DONE__ 0\n',
  }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })

  // The command runs as written, inside a tee that keeps its exit code.
  expect(sent).toContain('{ npm test')
  expect(sent).toContain("tee 'C:/Temp/claude-job-")
  expect(sent).toContain('PIPESTATUS')

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect((await ui.find({ type: 'Text', text: /Tests/ }))?.text).toContain('npm test')
    expect((await ui.find({ type: 'Text', text: /🎉/ }))?.text).toContain('🎉')
    expect((await ui.find({ type: 'Text', text: /100%/ }))?.text).toContain('100%')
    await ui.unmount()
  }
})

test('a command that is not a test run or a render goes through untouched', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  mock.env(on, { TEMP: 'C:\\Temp' })

  let sent = ''
  on('tool.call', (_, e) => {
    sent = String((e as { command?: string }).command)

    return { result: RAN }
  })

  await $.tool.call({ tool: 'Bash', command: 'ls -la' })

  expect(sent).toBe('ls -la')
})

test('the pane says so when nothing has run', async ($, on) => {
  mock.clock(on)
  mock.store(on)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect((await ui.find({ type: 'Text' }))?.text).toContain('Nothing yet')
  await ui.unmount()
})

const SPINNER = {
  plugin: 'job-progress',
  component: 'Spinner',
  requestId: 'main',
  props: { word: 'Creating', message: null, suffix: '…', mode: 'tool-use' },
} as const

test('while Claude works, a buddy acts it out in the spinner and the pane, under the fact, and the pane counts the work', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  mock.env(on, { TEMP: 'C:\\Temp' })
  on('command.register', () => ({ value: { command: 'jobs' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: 'done' }))
  on('tool.call', (_, e) => ({
    result: RAN,
    isError: (e as { command?: string }).command === 'exit 1' ? true : undefined,
  }))
  // Stands for the engine's own spinner: keeps the suffix the mod passed down.
  let suffix = ''
  on('ui.render', ($e, e) => {
    const { Text } = $e.ui.resolve(e)

    if (e.component === 'Spinner') {
      suffix = String((e.props as { suffix?: string }).suffix)
    }

    return <Text>{suffix}</Text>
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'make it fun', turnId: 't1' })
  await $.tool.call({ tool: 'Read', file_path: 'C:/site/index.html' })
  await $.tool.call({ tool: 'Edit', file_path: 'C:/site/index.html', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Bash', command: 'exit 1' })
  const buddy = pickBuddy('t1', '')
  const first = buddy.name.split(' ')[0] ?? ''

  // Right after the failed call the buddy gets a fright.
  const fright = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await fright.find({ type: 'Text', text: /Oops!\sA\stool\scall\sfailed/ }))?.text).toBeTruthy()
  await fright.unmount()

  // 36s in, between tool calls: the buddy is thinking, and the spinner says so.
  await clock.advance(36_000)

  for (const surface of ['terminal', 'desktop'] as const) {
    suffix = ''
    const spin = await $.ui.mount({ ...SPINNER, surface })
    expect(suffix).toContain(`${first} is thinking`)
    await spin.unmount()

    const pane = await $.ui.mount({ ...PANE, surface })
    expect((await pane.find({ type: 'Text', text: /Claude is working/ }))?.text).toContain('0:36')
    expect((await pane.find({ type: 'Text', text: /Thinking\sit\sover/ }))?.text).toBeTruthy()
    expect((await pane.find({ type: 'Text', text: /keeping you company/ }))?.text).toContain(buddy.name)
    expect((await pane.find({ type: 'Text', text: /1 read/ }))?.text).toContain('1 edited')
    expect((await pane.find({ type: 'Text', text: /Changed:/ }))?.text).toContain('index.html')
    expect((await pane.find({ type: 'Text', text: /failed tool/ }))?.text).toContain('1 failed tool call')

    // The fact comes first, above the buddy.
    const texts = (await pane.findAll({ type: 'Text' })).map(one => one.text ?? '')
    const factAt = texts.findIndex(text => text.includes('Did you know'))
    expect(factAt).toBeGreaterThan(-1)
    expect(factAt).toBeLessThan(texts.findIndex(text => text.includes('Claude is working')))
    await pane.unmount()
  }

  // The person picks their buddy, and asks it to keep still.
  const jobs = (args: string) =>
    $.command.run({ command: 'jobs', args } as unknown as Parameters<typeof $.command.run>[0])
  await jobs('buddy robot')
  await jobs('motion off')
  const picked = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await picked.find({ type: 'Text', text: /keeping you company/ }))?.text).toContain('Bolt the robot')
  await picked.unmount()

  await $.turn.complete({
    answer: 'done',
    durationMs: 456_000,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    usage: { input_tokens: 2000, output_tokens: 3000, cache_read_input_tokens: 40_000, cache_creation_input_tokens: 0, model: 'opus' },
  })
  const done = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await done.find({ type: 'Text', text: /Claude is done/ }))?.text).toContain('7:36')
  expect((await done.find({ type: 'Text', text: /tokens/ }))?.text).toContain('45k')
  expect((await done.find({ type: 'Text', text: /All\sdone\sin\s7:36/ }))?.text).toBeTruthy()
  await done.unmount()
})
