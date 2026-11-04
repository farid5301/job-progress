import { expect, test } from 'claude-code/testing'

import { STAGE_ROWS, STAGE_W, buddyIds, doing, pickBuddy, quip, stage, type Pose } from './buddy'

const POSES: Pose[] = ['thinking', 'reads', 'edits', 'commands', 'searches', 'web', 'helpers', 'other', 'oops', 'done', 'stopped', 'failed']

const flat = (rows: ReturnType<typeof stage>): string[] => rows.map(row => row.map(part => part.text).join(''))

test('every buddy, in every pose and frame, fills a stage of the same size', () => {
  for (const id of buddyIds) {
    const buddy = pickBuddy('', id)

    for (const pose of POSES) {
      for (let f = 0; f < 24; f++) {
        const rows = flat(stage({ buddy, pose, ms: 6 * 60_000 + f * 500, say: 'Reading a-very-long-file-name-indeed.tsx', quip: quip(buddy, pose, f * 500) }))

        expect(rows.length).toBe(STAGE_ROWS)
        for (const row of rows) {
          expect([...row].length).toBe(STAGE_W)
          // No plain spaces left to fold, and nothing wider than one column.
          expect(row).not.toContain(' ')
          expect([...row].every(ch => (ch.codePointAt(0) ?? 0) < 0x2000 || ch === '…')).toBe(true)
        }
      }
    }
  }
})

test('the buddy blinks, acts out the work and keeps still on request', () => {
  const cat = pickBuddy('', 'cat')
  const at = (pose: Pose, ms: number, isStill = false): string =>
    flat(stage({ buddy: cat, pose, ms, isStill, say: 'hi', quip: '' })).join('\n')

  expect(at('thinking', 0)).toContain('-.-')
  expect(at('thinking', 500)).toContain('o.o')
  expect(at('oops', 0)).toContain('O.O')
  expect(at('done', 0)).toContain('^.^')
  expect(at('commands', 0)).toContain('$ run')
  expect(at('edits', 0)).not.toBe(at('edits', 500))
  expect(at('edits', 0, true)).toBe(at('edits', 500, true))
  expect(at('reads', 0)).toContain('hi')
})

test('a different buddy from turn to turn, unless the person picks one', () => {
  const seen = new Set(['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'].map(id => pickBuddy(id, '').id))

  expect(seen.size).toBeGreaterThan(2)
  expect(pickBuddy('t1', 'owl').name).toBe('Hoot the owl')
  expect(doing(pickBuddy('', 'frog'), 'edits')).toBe('🐸 Ribbit is typing')
  expect(quip(pickBuddy('', 'cat'), 'oops', 0)).toContain('retry')
})
