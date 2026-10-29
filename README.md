# job-progress

A Claude Code mod that shows live progress while a test suite or a video render runs.

When Claude runs a test command or a render through the Bash or PowerShell tool, the mod shows:

- a **Progress pane** with a little animated scene instead of a plain bar (a rocket flying to the moon, a car racing to the flag, pac-man eating dots, a hammer whacking bugs, a bunny eating carrots, a turtle, a hungry face eating pizza), the percentage, **time left and the clock time it should finish**, counts (`12/20 files · 1 failed`), elapsed time, phase and the last output line (`/jobs` reopens it)
- a **one-line scene above the prompt** while a job runs
- a **status line** entry and a **toast** when it finishes

### While Claude works

Waiting on Claude itself gets fun too:

- **A pet hatches and grows the longer the turn runs:** 🥚 → 🐣 (20s) → 🐥 (1m) → 🐔 (3m) → 🦖 (7m) → 🐉 (15m). The spinner line takes turns showing the pet, the wait in everyday terms ("≈ about 3 cups of tea ☕") and what Claude has done so far (`📖 12 read · ✏ 4 edited · ⚡ 6 commands`).
- **After 45 seconds the Progress pane opens a waiting card:** the pet walking toward its next form, what Claude is doing right now, a fun fact that changes every 20 seconds, buttons for **🥠 New fact** and **🍖 Feed the pet**, and today's total waiting time.
- **A turn that ran for over 90 seconds ends with a toast**, so you know when to come back.
- `/jobs fun off` turns all of this off, `/jobs fun on` brings it back.

### Time left

- When the output says how far along it is (Playwright, pytest, Remotion), time left comes from that.
- Otherwise it comes from how long the same command took last time. For a command it has not seen, it falls back to the last run of the same tool in the same folder, marked `(rough)`.
- A first run that prints nothing has no estimate. Some renderers (HyperFrames, and Remotion when its output is piped) print nothing until they finish. Tell the mod yourself: `/jobs eta 20m`.

### Commands

- `/jobs` opens the pane
- `/jobs eta 20m` sets how long the running job should take (`45s`, `1h30m`, or minutes)
- `/jobs fun off` hides the waiting pet, `/jobs fun on` brings it back
- `/jobs theme pacman` picks the scene for new jobs, `/jobs theme auto` goes back to a surprise each time (`rocket racecar pizza turtle pacman bugs bunny`)

## What it recognises

- Tests: `npm/pnpm/yarn/bun test`, `vitest`, `jest`, `mocha`, `playwright test`, `pytest`, `go test`, `cargo test`, `dotnet test`, `node --test`
- Renders: `remotion render`, `remotion still`, `hyperframes render`, `npm run render`

Remotion output is read natively (bundling, rendering and encoding in one bar). Other renderers are followed by any `n/m` or `%` they print. Playwright and pytest print totals, so their bar is exact. Vitest, Jest, Go and `node --test` don't print a total up front, so the scene uses the total from the previous run of the same command; the first run shows the character bouncing back and forth, with counts.

## How it works

Claude Code does not stream a running command's output to mods. For the commands above only, the mod wraps the command so its output is also copied (`tee`) to a log file in your temp folder, then reads that log once a second. The command runs as written and keeps its exit code. If the mod itself fails, the command still runs once, unwrapped. Side effect: the model sees stdout and stderr merged into one stream for those commands. Logs are named `claude-job-<id>.log` and are left in the temp folder.

Run history (how long and how many) is kept in the mod's store to estimate the next run.

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install job-progress --marketplace farid5301/job-progress
```

From a shell:

```
claude plugin install job-progress --marketplace farid5301/job-progress
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `farid5301/job-progress`, then Add plugin.

## Develop

```
claude plugin validate .
claude plugin test .
```

## License

MIT
