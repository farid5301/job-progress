import { expect, mock, test } from 'claude-code/testing'

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
    expect((await ui.find({ type: 'Text', text: /██████/ }))?.text).toContain('100%')
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

  expect((await ui.find({ type: 'Text' }))?.text).toContain('No test run or render yet')
  await ui.unmount()
})
