import { expect, test } from 'claude-code/testing'

import { describeTool, emptyTurn, equivalent, fact, noteFile, poseOf, spinnerText, tally } from './waiting'

test('the pose follows the work: a tool, a fright after a failure, thinking in between, and the ending', () => {
  const t = { ...emptyTurn(), id: 't1', running: true, elapsedMs: 10_000 }

  expect(poseOf(t)).toBe('thinking')
  expect(poseOf({ ...t, kind: 'edits' })).toBe('edits')
  expect(poseOf({ ...t, errorAtMs: 8000 })).toBe('oops')
  expect(poseOf({ ...t, errorAtMs: 1000 })).toBe('thinking')
  expect(poseOf({ ...t, running: false, reason: 'answer' })).toBe('done')
  expect(poseOf({ ...t, running: false, reason: 'aborted' })).toBe('stopped')
  expect(poseOf({ ...t, running: false, reason: 'error' })).toBe('failed')
})

test('a wait is put in everyday terms', () => {
  expect(equivalent(20_000)).toContain('5 deep breaths')
  expect(equivalent(8 * 60_000)).toContain('2 cups of tea')
  expect(equivalent(45 * 60_000)).toContain('2 sitcom episodes')
})

test('tool calls are sorted into kinds, with edited files kept newest first', () => {
  expect(describeTool('Read', { file_path: 'C:\\site\\index.html' })).toEqual({ kind: 'reads', now: 'Reading index.html' })
  expect(describeTool('Edit', { file_path: '/a/b.ts' }).file).toBe('b.ts')
  expect(describeTool('Bash', { command: '{ npm test\n} 2>&1 | tee x' }).now).toBe('Running npm test')
  expect(noteFile(noteFile(noteFile([], 'a.ts'), 'b.ts'), 'a.ts')).toEqual(['a.ts', 'b.ts'])

  const t = { ...emptyTurn(), running: true, reads: 3, commands: 1, errors: 2 }
  expect(tally(t)).toBe('📖 3 read · ⚡ 1 command · ⚠ 2 errors')
  expect(spinnerText({ ...t, elapsedMs: 0, kind: 'reads' }, 'dog')).toBe('🐶 Biscuit is reading along')
})

test('facts come with a topic and move along with the fact clock', () => {
  expect(['📅 Scheduling', '📋 Project management', '🔬 Science', '💻 Code']).toContain(fact(0).tag)
  expect(fact(1).text).not.toBe(fact(0).text)
  expect(fact(-3).text).toBeTruthy()
})
