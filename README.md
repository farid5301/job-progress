# job-progress

A Claude Code mod that shows live progress while a test suite or a video render runs.

When Claude runs a test command or a render through the Bash or PowerShell tool, the mod shows:

- a **Progress pane** with a little animated scene instead of a plain bar (a rocket flying to the moon, a car racing to the flag, pac-man eating dots, a hammer whacking bugs, a bunny eating carrots, a turtle, a hungry face eating pizza), the percentage, **time left and the clock time it should finish**, counts (`12/20 files · 1 failed`), elapsed time, phase and the last output line (`/jobs` reopens it)
- a **one-line scene above the prompt** while a job runs
- a **status line** entry and a **toast** when it finishes

### While Claude works

Waiting on Claude itself gets a companion:

- **A buddy acts out what Claude is doing.** Each turn brings one of seven ASCII characters (Mochi the cat, Bolt the robot, Hoot the owl, Pip the penguin, Ribbit the frog, Clover the bunny, Biscuit the dog). It reads a book while Claude reads files, types on a laptop while Claude edits, watches a terminal while a command runs, hunts with a magnifier while Claude searches, spins a globe on the web, waves at a helper agent, and goes back to a thought cloud between tool calls. It blinks and fidgets, jumps when a tool call fails, gets a coffee on long thinks, and celebrates when the turn is done.
- **A speech bubble says what is happening** ("Reading register.tsx", "Thinking it over...") with a line from the buddy under it.
- **Nothing jumps.** The buddy is plain ASCII on a stage of fixed size, so the card keeps its size as it animates.
- **The Progress pane opens after 45 seconds of waiting**, with:
  - **💡 Did you know?** on top: a fact about scheduling, project management, science or code that changes by itself every 15 seconds.
  - **Claude is working:** the time and the wait in everyday terms ("about 2 cups of tea ☕"), the buddy, what Claude has done (`📖 12 read · ✏ 4 edited · ⚡ 6 commands`), which files it changed, failed tool calls, and today's waiting (turns, total, typical and longest).
  - **When it ends:** done, stopped or ended early, how long it took and how many tokens it used.
- **The spinner line** takes turns showing what the buddy is up to ("🐱 Mochi is typing"), the wait in everyday terms and the tally.
- **A turn that ran for over 90 seconds ends with a toast** saying how long it took, how many files changed and any failed tool calls.
- `/jobs buddy cat` keeps one buddy (`cat robot owl penguin frog bunny dog`), `/jobs buddy auto` brings a different one each turn.
- `/jobs motion off` keeps the buddy still, for less motion. `/jobs motion on` brings the animation back.
- `/jobs fun off` turns the waiting card off, `/jobs fun on` brings it back.

### Time left

- When the output says how far along it is (Playwright, pytest, Remotion), time left comes from that.
- Otherwise it comes from how long the same command took last time. For a command it has not seen, it falls back to the last run of the same tool in the same folder, marked `(rough)`.
- A first run that prints nothing has no estimate. Some renderers (HyperFrames, and Remotion when its output is piped) print nothing until they finish. Tell the mod yourself: `/jobs eta 20m`.

### Commands

- `/jobs` opens the pane
- `/jobs eta 20m` sets how long the running job should take (`45s`, `1h30m`, or minutes)
- `/jobs buddy cat` picks your buddy, `/jobs buddy auto` a different one each turn
- `/jobs motion off` keeps the buddy still, `/jobs motion on` animates it again
- `/jobs fun off` hides the waiting card, `/jobs fun on` brings it back
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
