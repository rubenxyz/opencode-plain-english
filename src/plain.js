import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const BANNER = "PLAIN MODE ACTIVE";

const RULES = `Write every reply in plain English: everyday words, full sentences, no jargon or nerdspeak.

- No code in replies. Say what it does and what changed in practical terms; show code only when asked.
- Keep names exact, stay accurate, keep security and data-loss warnings explicit.

Turn off with /plain off, "stop plain", or "normal mode".`;

export function plainBlock() {
  return BANNER + "\n\n" + RULES;
}

const COMMANDS = {
  plain: {
    description: "Turn plain mode on or off — /plain [on|off]",
    template: "Plain mode request: $ARGUMENTS\n\nReply in one short plain-English sentence confirming whether plain mode is now on or off.",
  },
  "plain-commit": {
    description: "Draft a plain-English commit message for the staged changes",
    template: `Write a commit message for the staged changes in plain English.

- Subject line: short and concrete, ordinary words. No type prefixes or scope tags.
- Body: explain what changed and why in everyday language.
- Do not paste the diff, file lists, or code.`,
  },
  "plain-review": {
    description: "Review the current changes in plain English",
    template: `Review the current changes and explain in plain English what they do.

Point out real problems in practical terms: what breaks, what is risky, what will surprise someone later.
No code, no jargon, no style nitpicks. Keep it short.`,
  },
};

export function injectRules(system) {
  const block = plainBlock();
  for (let i = 0; i < system.length; i++) {
    const entry = system[i];
    if (typeof entry === "string" && entry.includes(BANNER)) {
      system[i] = entry.slice(0, entry.indexOf(BANNER)) + block;
      return;
    }
  }
  if (system.length > 0) {
    system[system.length - 1] += "\n\n" + block;
  } else {
    system.push(block);
  }
}

function opencodeConfigDir() {
  return process.env.XDG_CONFIG_HOME
    ? path.join(process.env.XDG_CONFIG_HOME, "opencode")
    : path.join(os.homedir(), ".config", "opencode");
}

const flagPath = path.join(opencodeConfigDir(), ".plain-active");

function defaultMode() {
  return (process.env.PLAIN_DEFAULT || "on").toLowerCase() === "off" ? "off" : "on";
}

export function isActive() {
  try {
    return readFileSync(flagPath, "utf8").trim() === "on";
  } catch {
    return false;
  }
}

export function setActive(on) {
  try {
    if (on) {
      mkdirSync(path.dirname(flagPath), { recursive: true });
      const tmp = flagPath + "." + process.pid + ".tmp";
      writeFileSync(tmp, "on\n", { mode: 0o600 });
      renameSync(tmp, flagPath);
    } else if (existsSync(flagPath)) {
      unlinkSync(flagPath);
    }
  } catch {}
}

function debug(message) {
  if (process.env.PLAIN_DEBUG !== "1") return;
  try {
    appendFileSync("/tmp/plain-debug.log", new Date().toISOString() + " " + message + "\n");
  } catch {}
}

const POLITE = /^(?:(?:hey|hi|ok|okay|now)\b[\s,]*|please\b[\s,]*|pls\b[\s,]*|(?:can|could|would|will)\s+you\s+(?:please\s+)?)+/i;

export function parseIntent(text) {
  if (typeof text !== "string") return null;
  const firstLine = text.split("\n", 1)[0];
  let line = firstLine.trim().replace(/^[>*\-\[\]'"“”‘’\s]+/, "").replace(/[\s.!?,;:'"“”‘’]+$/, "");
  if (!line) return null;
  line = line.replace(POLITE, "");
  const t = line.toLowerCase();

  if (/^\/plain\s+(off|stop|disable|normal)$/.test(t)) return "off";
  if (/^\/plain(\s+(on|enable|start|english))?$/.test(t)) return "on";

  if (/^plain\s+mode\s+request\s*:?\s*(off|stop|disable|normal)\b/.test(t)) return "off";
  if (/^plain\s+mode\s+request\b/.test(t)) return "on";

  if (/^(stop|quit|end|disable|turn\s+off|switch\s+off)\s+plain(\s+(english\s+)?mode)?$/.test(t)) return "off";
  if (/^normal\s+mode$/.test(t)) return "off";
  if (/^plain\s+off$/.test(t)) return "off";
  if (/^plain\s+(english\s+)?mode\s+off$/.test(t)) return "off";

  if (/^plain\s+english$/.test(t)) return "on";
  if (/^plain\s+(english\s+)?mode$/.test(t)) return "on";
  if (/^plain\s+on$/.test(t)) return "on";
  if (/^(turn\s+on|enable|activate|start|switch\s+to)\s+(the\s+)?plain(\s+(english\s+)?mode)?$/.test(t)) return "on";
  if (/^(talk|speak|write|explain|answer|respond|reply)\s+(to\s+me\s+)?in\s+plain(\s+english)?(\s+mode)?\b/.test(t)) return "on";

  return null;
}

function applyDefault() {
  setActive(defaultMode() === "on");
  debug("session default -> " + defaultMode());
}

export const PlainPlugin = async () => {
  applyDefault();

  return {
    config: async (config) => {
      try {
        if (!config.command || typeof config.command !== "object") config.command = {};
        for (const [name, def] of Object.entries(COMMANDS)) {
          if (!config.command[name]) config.command[name] = { ...def };
        }
      } catch {}
    },
    event: async ({ event } = {}) => {
      if (event && event.type === "session.created") applyDefault();
    },
    "chat.message": async (_input, output) => {
      const parts = output && output.parts;
      if (!Array.isArray(parts)) return;
      for (const part of parts) {
        if (!part || part.type !== "text" || typeof part.text !== "string") continue;
        const intent = parseIntent(part.text);
        if (intent === "on") {
          setActive(true);
          debug("intent on");
        } else if (intent === "off") {
          setActive(false);
          debug("intent off");
        }
      }
    },
    "experimental.chat.system.transform": async (_input, output) => {
      if (!output || !Array.isArray(output.system)) return;
      if (isActive()) {
        injectRules(output.system);
        debug("rules injected");
      }
    },
  };
};

export default PlainPlugin;
