# plain

**Plain-English mode for [opencode](https://opencode.ai).**

Your coding agent still writes the code, runs the commands, and does the work.
It just stops talking to you like a compiler.

`plain` is a small, dependency-free opencode plugin that tells the assistant to
answer in everyday words: full sentences, no jargon, no acronyms, no code in
explanations. Works in the TUI and in `opencode run`.

## Before and after

Default agent:

> A covering index is a denormalized access path that materializes the
> projected columns into the leaf level of the B-tree, eliminating heap
> fetches on index-only scans.

With plain:

> A covering index keeps copies of the columns you need right inside the
> lookup list, so the database never has to open the table itself.

Same facts, same accuracy. One of them you can read on a phone.

## Install

```bash
git clone https://github.com/rubenxyz/opencode-plain-english.git
cd opencode-plain-english
./install.sh
```

The script symlinks everything into your opencode config
(`~/.config/opencode`, or `$XDG_CONFIG_HOME/opencode`):

| Repo file | Installed as |
| --- | --- |
| `src/plain.js` | `plugins/plain.js` |
| `commands/plain.md` | `commands/plain.md` |
| `commands/plain-commit.md` | `commands/plain-commit.md` |
| `commands/plain-review.md` | `commands/plain-review.md` |

If a real file is already at one of those paths, it is kept as
`.bak.<timestamp>` first. Restart opencode and you are done.

## Use

| Command | What it does |
| --- | --- |
| `/plain` | Turn plain mode on |
| `/plain off` | Turn plain mode off for this session |
| `/plain-commit` | Draft a plain-English commit message for the staged changes |
| `/plain-review` | Explain the current changes in plain English |

You can also just say it. The first line of your message can be
`talk in plain english`, `plain mode`, `plain english`, or
`explain in plain english ...` to turn it on, and `stop plain`, `plain off`, or
`normal mode` to turn it off.

Plain mode is **on by default** at the start of every session. `/plain off`
lasts until a new session begins.

## The exact prompt

While plain mode is on, this block is appended to the system prompt on every
request:

```
PLAIN MODE ACTIVE

Write every reply in plain English: everyday words, full sentences, no jargon or nerdspeak.

- No code in replies. Say what it does and what changed in practical terms; show code only when asked.
- Keep names exact, stay accurate, keep security and data-loss warnings explicit.

Turn off with /plain off, "stop plain", or "normal mode".
```

The first line doubles as a marker, so the block is replaced in place instead
of stacking up. Edit the `RULES` constant in `src/plain.js` to change it.

## What it changes, and what it does not

- Changes: how the assistant talks to you.
- Does not change: the model, the tools, permissions, or the work itself.
  Plain mode does not make the agent vague or slower, and it keeps file names,
  commands, and warnings exact.

## Configuration

| Variable | Effect |
| --- | --- |
| `PLAIN_DEFAULT=off` | Start with plain mode off; toggle per session with `/plain` |
| `PLAIN_DEBUG=1` | Log hook activity to `/tmp/plain-debug.log` |

## How it works

The plugin is around 150 lines of JavaScript with no dependencies:

- `event` (`session.created`) writes the on/off flag to
  `~/.config/opencode/.plain-active`, resetting to the default each session.
- `chat.message` reads your message for commands and natural triggers.
- `experimental.chat.system.transform` adds the rules to the system prompt when
  active, replacing an earlier copy rather than duplicating it.

## Uninstall

```bash
./install.sh --uninstall
```

Removes the symlinks and the flag file. Restart opencode.

## Development

```bash
npm test
```

The smoke test covers the trigger parser, the prompt injection, and the plugin
hooks.

## Credits

Inspired by [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman),
which compresses the agent's speech to a caveman grunt. `plain` does the
opposite, for people who want the explanation to land the first time. Not
affiliated with that project.

## License

MIT. See [LICENSE](LICENSE).
