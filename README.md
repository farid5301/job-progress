# job-progress

A Claude Code mod that shows live progress while a test suite or a video render runs.

When Claude runs a test command or a render through the Bash or PowerShell tool, the mod shows:

- a **Progress pane** with a bar, percentage, counts (`12/20 files · 1 failed`), elapsed time, ETA, phase and the last output line (`/jobs` reopens it)
- a **one-line bar above the prompt** while a job runs
- a **status line** entry and a **toast** when it finishes

## What it recognises

- Tests: `npm/pnpm/yarn/bun test`, `vitest`, `jest`, `mocha`, `playwright test`, `pytest`, `go test`, `cargo test`, `dotnet test`, `node --test`
- Renders: `remotion render`, `remotion still`, `hyperframes render`, `npm run render`

Remotion output is read natively (bundling, rendering and encoding in one bar). Other renderers are followed by any `n/m` or `%` they print. Playwright and pytest print totals, so their bar is exact. Vitest, Jest, Go and `node --test` don't print a total up front, so the bar uses the total from the previous run of the same command; the first run shows a sweeping bar with counts.

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
