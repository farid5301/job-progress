import { expect, test } from 'claude-code/testing'

import { describeTool, emptyTurn, equivalent, spinnerText, stage, tally, untilNext, walk } from './waiting'

test('the pet grows with the wait, and walks toward what it becomes next', () => {
  expect(stage(5_000).pet).toBe('🥚')
  expect(stage(30_000).pet).toBe('🐣')
  expect(stage(16 * 60_000).pet).toBe('🐉')
  expect(walk(30_000, 10).endsWith('🐥')).toBe(true)
  expect(walk(30_000, 10).indexOf('🐣')).toBeLessThan(walk(55_000, 10).indexOf('🐣'))
  expect(untilNext(50_000)).toBe('🐥 in 10s')
  expect(untilNext(20 * 60_000)).toBeUndefined()
})

test('a wait is put in everyday terms', () => {
  expect(equivalent(20_000)).toContain('5 deep breaths')
  expect(equivalent(8 * 60_000)).toContain('2 cups of tea')
  expect(equivalent(45 * 60_000)).toContain('2 sitcom episodes')
  expect(equivalent(2 * 60 * 60_000)).toContain('movie')
})

test('tool calls are sorted into kinds with a few words on each', () => {
  expect(describeTool('Read', { file_path: 'C:\\site\\index.html' })).toEqual({ kind: 'reads', now: 'Reading index.html' })
  expect(describeTool('Bash', { command: '{ npm test\n} 2>&1 | tee x' }).now).toBe('Running npm test')
  expect(describeTool('mcp__github__create_issue', {}).kind).toBe('other')

  const t = { ...emptyTurn(), running: true, reads: 3, commands: 1 }
  expect(tally(t)).toBe('📖 3 read · ⚡ 1 command')
  expect(spinnerText({ ...t, elapsedMs: 0 })).toContain('🥚')
})
