import { expect, test } from 'claude-code/testing'

import { BRICK_W, FIELD_H, action, cells, moveTo, newGame, step } from './breakout'

test('a new game has a full wall of bricks and the ball on the paddle', () => {
  const g = newGame(32, 0)

  expect(g.bricks.length).toBe(4)
  expect(g.bricks[0]?.length).toBe(32 / BRICK_W)
  expect(g.by).toBe(FIELD_H - 2)
  expect(cells(g).length).toBe(FIELD_H)
  expect(cells(g)[FIELD_H - 1]?.some(cell => cell.ch === '▀')).toBe(true)
})

test('the ball breaks a brick, scores, and bounces back down', () => {
  // Put the ball just under the bottom row of bricks, flying up.
  const g = { ...action(newGame(32, 0)), bx: 5, by: 5.2, dx: 0, dy: -0.5 }
  const after = step(g)

  expect(after.bricks[3]?.[1]).toBe(0)
  expect(after.score).toBe(10)
  expect(after.dy).toBeGreaterThan(0)
  expect(after.message).toContain('Meeting')
})

test('the paddle catches the ball and a miss costs a life', () => {
  const g = moveTo(action(newGame(32, 0)), 10)
  const caught = step({ ...g, bx: 10, by: FIELD_H - 1.6, dx: 0, dy: 0.5 })
  expect(caught.dy).toBeLessThan(0)

  const missed = step({ ...g, bx: 30, by: FIELD_H - 0.6, dx: 0, dy: 0.5 })
  expect(missed.lives).toBe(2)
  expect(missed.phase).toBe('ready')

  const over = step({ ...g, lives: 1, score: 120, bx: 30, by: FIELD_H - 0.6, dx: 0, dy: 0.5 })
  expect(over.phase).toBe('over')
  expect(over.best).toBe(120)
  expect(action(over).phase).toBe('play')
})

test('the demo plays on its own for a long while', () => {
  let g = newGame(32, 0)
  let broken = 0

  for (let i = 0; i < 600; i++) {
    g = step(g)
  }
  broken = 32 / BRICK_W * 4 - g.bricks.flat().filter(b => b === 1).length + (g.level - 1) * 32
  expect(broken).toBeGreaterThan(5)
})
