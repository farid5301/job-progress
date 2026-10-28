import { expect, test } from 'claude-code/testing'

import { detect, exitCode, parse } from './parse'

test('commands that start a test run or a render are told apart', () => {
  expect(detect('npm test')).toBe('test')
  expect(detect('cd website && npx vitest run')).toBe('test')
  expect(detect('pnpm run test:unit -- --coverage')).toBe('test')
  expect(detect('CI=1 npx playwright test --reporter=line')).toBe('test')
  expect(detect('python -m pytest -q')).toBe('test')
  expect(detect('npx remotion render src/index.ts Main out/video.mp4')).toBe('render')
  expect(detect('npx hyperframes render')).toBe('render')
  expect(detect('npm run render')).toBe('render')
})

test('commands that only mention a runner are left alone', () => {
  expect(detect('git commit -m "fix jest config"')).toBeUndefined()
  expect(detect('grep -r vitest package.json')).toBeUndefined()
  expect(detect('ls src')).toBeUndefined()
  expect(detect('npx vitest --version')).toBeUndefined()
})

test('remotion output becomes one bar across bundling, rendering and encoding', () => {
  const early = parse('render', 'Bundling 40%\n', null)
  expect(early.phase).toBe('Bundling')
  expect(Math.round(early.percent ?? -1)).toBe(2)

  const mid = parse('render', 'Rendered 150/300, time remaining: 10s\r\nEncoded 100/300\r\n', null)
  expect(mid.phase).toBe('Rendering frames')
  expect(mid.done).toBe(150)
  expect(mid.total).toBe(300)
  // 5 for the bundle, then 95 of the way through (rendered 50% + encoded 33%) / 2.
  expect(Math.round(mid.percent ?? -1)).toBe(45)

  const late = parse('render', 'Rendered 300/300\nEncoded 150/300\n', null)
  expect(late.phase).toBe('Encoding')
})

test('another renderer is followed by its own percentage or fraction', () => {
  expect(parse('render', 'Capturing frames 12/48\n', null).percent).toBe(25)
  expect(parse('render', '\x1b[32mEncoding video 80%\x1b[0m\n', null).percent).toBe(80)
  expect(parse('render', 'no numbers yet\n', null).percent).toBeNull()
})

test('vitest files count toward the total the last run had', () => {
  const log = [' ✓ src/a.test.ts (3 tests) 10ms', ' ✓ src/b.test.ts (2 tests) 8ms', ' ❯ src/c.test.ts (4 tests | 1 failed) 20ms', '   × case'].join('\n')
  const got = parse('test', log, 10)

  expect(got.done).toBe(3)
  expect(got.failed).toBe(1)
  expect(got.total).toBe(10)
  expect(got.percent).toBe(30)
  expect(got.unit).toBe('files')
})

test('playwright and pytest print their own totals', () => {
  const pw = parse('test', '[3/12] › a.spec.ts › one\n[4/12] › a.spec.ts › two\n', null)
  expect([pw.done, pw.total, pw.percent]).toEqual([4, 12, 33])

  const py = parse('test', 'collected 50 items\ntests/test_a.py ..F.  [ 8%]\n', null)
  expect([py.done, py.failed, py.total, py.percent]).toEqual([4, 1, 50, 8])
})

test('a run with no total yet has no percentage', () => {
  expect(parse('test', ' ✓ src/a.test.ts (3 tests) 10ms\n', null).percent).toBeNull()
})

test('the exit code is read from the end of the log, and never from the output', () => {
  expect(exitCode('all good\n__CC_JOB_DONE__ 0\n')).toBe(0)
  expect(exitCode('boom\n__CC_JOB_DONE__ 1\n')).toBe(1)
  expect(exitCode('still going\n')).toBeUndefined()
  expect(parse('test', 'x\n__CC_JOB_DONE__ 0\n', null).lastLine).toBe('x')
})

test('node --test lines count as they print, and carry over to the next run', () => {
  const log = '✔ step 1 (700.1ms)\n✔ step 2 (699.9ms)\n✖ step 3 (12ms)\n'
  const first = parse('test', log, null)
  expect([first.done, first.failed, first.percent]).toEqual([3, 1, null])

  expect(parse('test', log, 6).percent).toBe(50)
})
