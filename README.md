# Plain English

You might have heard of `/caveman`...
`opencode-plain-english` makes OpenCode speak back to you in plain English.

Your coding agent still writes the code, runs the commands, and does the work.
It just stops talking to you like a compiler.

`plain` is a small, dependency-free opencode plugin that tells the assistant to
answer in everyday words: full sentences, no jargon, no acronyms, no code in
explanations. Works in the TUI and in `opencode run`, on OpenCode 1.x and
OpenCode 2.x.

![plain mode in an opencode run](assets/demo.gif)

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

One package serves both OpenCode majors. It advertises a `server` entrypoint
(the OpenCode 1.x plugin contract) and a `setup` entrypoint (the OpenCode 2
contract), so the same version installs on either.

### OpenCode 2

OpenCode 2 installs plugins from npm specs and reads them from the native
`plugins` key in `opencode.json`:

```bash
opencode plugin add opencode-plain-english
```

Or add it to `~/.config/opencode/opencode.json` yourself:

```json
{
  "plugins": ["opencode-plain-english"]
}
```

The plugin registers `/plain`, `/plain-commit`, and `/plain-review` by itself.
Restart OpenCode and you are done.

### From git

```bash
git clone https://github.com/rubenxyz/opencode-plain-english.git
cd opencode-plain-english
./install.sh
```

`./install.sh` installs the OpenCode 2 entrypoint by default and symlinks
`src/server.js` to `~/.config/opencode/plugins/opencode-plain-english.js`.
Pass `--v1` to install the legacy OpenCode 1.x entrypoint plus the markdown
command bridge instead. If a real file is already at one of those paths, it is
kept as `.bak.<timestamp>` first. Restart OpenCode and you are done.

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

The plugin is around 230 lines of JavaScript with no dependencies. It keeps the
same behaviour on both OpenCode majors by mapping the old hooks onto the
OpenCode 2 domains:

| OpenCode 1.x hook | OpenCode 2 domain |
| --- | --- |
| `config(config)` | `context.command.transform` (`.add(...)`) |
| `event({event})` on `session.created` | `context.event.subscribe(...)` |
| `chat.message(_input, output)` | `context.session.hook("prompt", ...)` |
| `experimental.chat.system.transform` | `context.session.hook("context", ...)` |
| `~/.config/opencode/.plain-active` | `context.storage` key `plain-active` |

On OpenCode 2 the on/off flag lives in OpenCode's own storage under the
`plain-active` key; on OpenCode 1.x (and in the tests) it stays in the
`.plain-active` file. Either way the first line of your message is scanned for
commands and natural triggers, and the rules block is added to the system
prompt when active, replacing an earlier copy rather than duplicating it.

## Uninstall

```bash
./install.sh --uninstall
```

Removes the symlinks and the flag file. Restart opencode.

## Development

```bash
npm test
```

The smoke test covers the trigger parser, the prompt injection, the V1 hooks,
and the OpenCode 2 wiring (command transform, session prompt/context hooks,
event subscription, and storage).

### Recording the demo

The GIF at the top is recorded with [vhs](https://github.com/charmbracelet/vhs)
and its `ttyd` dependency. From the repo root:

```bash
vhs assets/demo.tape
```

That replays the scripted session and rewrites `assets/demo.gif`. Edit
`assets/demo.tape` to change the command, the font, or the timing.

## Credits

Inspired by [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman),
which compresses the agent's speech to a caveman grunt. `plain` does the
opposite, for people who want the explanation to land the first time. Not
affiliated with that project.

## License

MIT. See [LICENSE](LICENSE).
