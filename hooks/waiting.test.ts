import { expect, test } from 'claude-code/testing'

import { caption, chapter, describeTool, emptyTurn, equivalent, fact, noteFile, scene, spinnerText, tally, untilNext } from './waiting'

// A cell is an emoji or two columns; count columns the way a terminal does.
const columns = (text: string): number =>
  [...text].reduce((sum, ch) => {
    const code = ch.codePointAt(0) ?? 0

    if (code === 0xfe0f) {
      return sum
    }

    return sum + (code > 0x1f000 || (code >= 0x2600 && code <= 0x27bf) || code === 0x2b50 ? 2 : 1)
  }, 0)

test('the journey moves through chapters as the wait grows', () => {
  expect(chapter(10_000).name).toBe('Morning walk')
  expect(chapter(60_000).name).toBe('Through the forest')
  expect(chapter(3 * 60_000).name).toBe('Along the coast')
  expect(chapter(6 * 60_000).isNight).toBe(true)
  expect(chapter(25 * 60_000).name).toBe('Into space')
  expect(untilNext(30_000)).toEqual({ name: 'Through the forest', ms: 15_000 })
  expect(untilNext(30 * 60_000)).toBeUndefined()
  expect(caption(0)).toContain('Biscuit the dog')
})

test('every scene keeps its width as the world scrolls past', () => {
  for (const ms of [0, 50_000, 150_000, 360_000, 700_000, 1_500_000]) {
    const widths = new Set<number>()

    for (let f = 0; f < 12; f++) {
      const rows = scene(ms + f * 500, 16)
      expect(rows.length).toBe(4)
      for (const row of rows) {
        widths.add(columns(row.text))
      }
    }
    expect([...widths]).toEqual([32])
  }
})

test('the traveller stays put while the world moves, and the sun crosses the sky', () => {
  const a = scene(0, 16)
  const b = scene(1500, 16)

  expect(a[2]?.text).toContain('🐕')
  expect(b[2]?.text).toContain('🐕')
  expect(a[1]?.text).not.toBe(scene(6000, 16)[1]?.text)
  expect([...(scene(5000, 16)[0]?.text ?? '')].indexOf('🌞')).toBeLessThan([...(scene(40_000, 16)[0]?.text ?? '')].indexOf('🌞'))
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
  expect(spinnerText({ ...t, elapsedMs: 0 })).toContain('🐕')
})

test('facts come with a topic and move along with the fact clock', () => {
  expect(['📅 Scheduling', '📋 Project management', '🔬 Science', '💻 Code']).toContain(fact(0).tag)
  expect(fact(1).text).not.toBe(fact(0).text)
  expect(fact(-3).text).toBeTruthy()
})
