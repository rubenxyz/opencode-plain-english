# plain — plain-English mode for opencode

A small opencode plugin that makes the assistant answer you in plain English:
everyday words, full sentences, no jargon, no code in explanations. It is a
from-scratch plugin inspired by [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman)
(the "talk like a caveman" idea, inverted into "talk like a person").

## What it does

While plain mode is on, the plugin injects a short ruleset into the system
prompt before every request. It does not change the model, tools, or how code
is written — only how the assistant talks to you.

Rules in short:

- Everyday words, full sentences.
- No jargon, no acronyms, no nerdspeak; uncertain terms get explained.
- No code in replies. What it does, what changed, what to do next.
- Accurate and complete; security and data-loss warnings stay explicit.

## Install

```bash
./install.sh
```

This symlinks the plugin and the three command files into your opencode config
(`~/.config/opencode`, or `$XDG_CONFIG_HOME/opencode`):

- `plugins/plain.js` -> `src/plain.js`
- `commands/plain.md`, `commands/plain-commit.md`, `commands/plain-review.md`

Restart opencode, then use it. Any existing file at those paths is kept as a
`.bak.<timestamp>` before linking.

Uninstall:

```bash
./install.sh --uninstall
```

## Usage

| Command | What it does |
| --- | --- |
| `/plain` | Turn plain mode on |
| `/plain off` | Turn plain mode off for this session |
| `/plain-commit` | Draft a plain-English commit message for the staged changes |
| `/plain-review` | Explain the current changes in plain English |

Natural triggers work too: `talk in plain english`, `plain mode`,
`plain english`, or `explain in plain english ...` turns it on; `stop plain`,
`normal mode`, `plain off` turns it off. The phrase must be the first line of
your message.

Plain mode is **on by default** at the start of every session. `/plain off`
lasts until a new session starts. Turn the plugin off always by starting
opencode with `PLAIN_DEFAULT=off` or by editing `defaultMode()` in
`src/plain.js`.

## How it works

- `src/plain.js` — the plugin. Hooks `event` (`session.created`), `chat.message`
  (reads `/plain` and natural triggers), and `experimental.chat.system.transform`
  (adds the ruleset when active, replacing an earlier copy instead of stacking).
- `commands/*.md` — prompt templates; opencode loads them from
  `~/.config/opencode/commands/`.
- The on/off state is a flag file at `~/.config/opencode/.plain-active`.

Troubleshooting: run opencode with `PLAIN_DEBUG=1` and check
`/tmp/plain-debug.log`.

## Development

```bash
npm test
```

The smoke test covers the trigger parser, the injection, and the plugin hooks.

## License

MIT. Not affiliated with the caveman project; its opencode adapter was the
design reference.
