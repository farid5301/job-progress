import { expect, test } from 'claude-code/testing'

import type { Job } from '../types'
import { clock, family, fmt, left, parseDuration, pickTheme, quip, track } from './fun'

const job = (patch: Partial<Job> = {}): Job => ({
  id: 'toolu_1',
  kind: 'render',
  label: 'remotion render',
  file: '/tmp/x.log',
  signature: 'render:x',
  startedAt: 0,
  elapsedMs: 0,
  status: 'running',
  percent: null,
  isEstimate: false,
  phase: 'Starting',
  done: 0,
  total: null,
  failed: 0,
  unit: 'frames',
  lastLine: '',
  expectedMs: null,
  expectedTotal: null,
  expectedFrom: null,
  family: 'family:render:remotion:',
  theme: 'rocket',
  ...patch,
})

// A cell is an emoji or two columns; count the columns the way a terminal does.
const columns = (text: string): number =>
  [...text].reduce((sum, ch) => {
    const code = ch.codePointAt(0) ?? 0

    return sum + (code > 0x1f000 || code === 0x2728 ? 2 : 1)
  }, 0)

test('the track keeps its width as the head moves, for every scene', () => {
  for (const theme of ['rocket', 'racecar', 'pizza', 'turtle', 'pacman', 'bugs', 'bunny']) {
    const widths = new Set<number>()

    for (const percent of [null, 0, 25, 60, 99]) {
      for (const elapsedMs of [0, 1000, 7000]) {
        widths.add(columns(track(job({ theme, percent, elapsedMs }), 12)))
      }
    }
    expect(widths.size).toBe(1)
  }
})

test('the head moves forward with the percentage and the end is a party', () => {
  const at = (percent: number): number => track(job({ percent }), 12).indexOf('🚀')

  expect(at(10)).toBeLessThan(at(50))
  expect(at(50)).toBeLessThan(at(90))
  expect(track(job({ status: 'passed', percent: 100 }), 12)).toContain('🎉')
  expect(track(job({ status: 'failed', percent: 40 }), 12)).toContain('💥')
})

test('time left comes from the percentage, else from the last run, else nothing', () => {
  expect(left(job({ percent: 25, elapsedMs: 60_000 }))?.text).toBe('~3:00 left')
  expect(left(job({ expectedMs: 600_000, elapsedMs: 100_000 }))?.text).toBe('~8:20 left')
  expect(left(job({ expectedMs: 600_000, expectedFrom: 'similar', elapsedMs: 100_000 }))?.text).toContain('rough')
  expect(left(job({ expectedMs: 60_000, elapsedMs: 90_000 }))?.text).toContain('longer than the last run')
  expect(left(job())).toBeUndefined()
  expect(left(job({ status: 'passed', expectedMs: 5000 }))).toBeUndefined()
})

test('durations read the way a person types them', () => {
  expect(parseDuration('20m')).toBe(20 * 60_000)
  expect(parseDuration('1h30m')).toBe(90 * 60_000)
  expect(parseDuration('45s')).toBe(45_000)
  expect(parseDuration('15')).toBe(15 * 60_000)
  expect(parseDuration('soon')).toBeUndefined()
  expect(fmt(3_725_000)).toBe('1:02:05')
  expect(fmt(65_000)).toBe('1:05')
  expect(clock(new Date(2026, 9, 28, 21, 5).getTime())).toBe('9:05 PM')
})

test('a similar run is found by the tool and the folder', () => {
  const a = family('render', 'cd /c/TP-video/sr-hf; npx hyperframes render -o a.mp4')
  const b = family('render', 'cd /c/TP-video/sr-hf && npx hyperframes render -q draft')

  expect(a).toBe(b)
  expect(a).not.toBe(family('render', 'cd /c/TP-video/dav && npx remotion render src/index.ts X'))
})

test('a picked scene wins, else the kind of job and its id choose one', () => {
  expect(pickTheme('render', 'a', 'pacman')).toBe('pacman')
  expect(['rocket', 'racecar', 'pizza', 'turtle']).toContain(pickTheme('render', 'abc', null))
  expect(['pacman', 'bugs', 'bunny']).toContain(pickTheme('test', 'abc', 'nonsense'))
  expect(quip(job({ percent: 95 }))).toContain('Almost')
  expect(quip(job({ status: 'failed', kind: 'test' }))).toContain('bugs')
})
