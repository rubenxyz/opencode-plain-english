// OpenCode 2 (promise plugin API) port of Plain English.
//
// The V1 plugin in ./plain.js keeps working for OpenCode 1.x. This module
// exposes the same behaviour through the OpenCode 2 domains:
//
//   V1 hook                              OpenCode 2 domain
//   ------------------------------------ --------------------------------
//   config(config)                       context.command.transform(.add)
//   chat.message(_input, output)         context.session.hook("prompt")
//   event({event})                       context.event.subscribe(...)
//   experimental.chat.system.transform   context.session.hook("context")
//   ~/.config/opencode/.plain-active     context.storage
//
// See ./server.js for the entrypoint the package advertises as "./server".
import {
  BANNER,
  COMMANDS,
  defaultMode,
  debug,
  parseIntent,
  plainBlock,
} from "./plain.js";

export const PLAIN_PLUGIN_ID = "opencode-plain-english";
export const PLAIN_STORAGE_KEY = "plain-active";

// Keep the plugin dependency-free: `define` is the identity helper from
// @opencode/plugin, so we inline the same trivial contract instead of pulling
// the host package in.
export function define(plugin) {
  return plugin;
}

// Inject the rules block into a request's system prompt. OpenCode 2.0.19
// models `session.context.system` as SystemPart[] (`{ type: "text", text }`),
// while older/synthetic adapters used string[]. Handle both: replace an
// earlier copy in place when the marker is present, otherwise append once.
export function injectRulesIntoSystem(system) {
  if (!Array.isArray(system)) return false;
  const block = plainBlock();
  const replaceMarker = (value) => {
    const index = value.indexOf(BANNER);
    if (index === -1) return undefined;
    return value.slice(0, index) + block;
  };

  for (let i = 0; i < system.length; i++) {
    const part = system[i];
    if (typeof part === "string") {
      const next = replaceMarker(part);
      if (next !== undefined) {
        system[i] = next;
        return true;
      }
    } else if (part && typeof part === "object" && typeof part.text === "string") {
      const next = replaceMarker(part.text);
      if (next !== undefined) {
        part.text = next;
        return true;
      }
    }
  }

  if (system.length > 0) {
    const last = system[system.length - 1];
    if (typeof last === "string") {
      system[system.length - 1] = last + "\n\n" + block;
      return true;
    }
    if (last && typeof last === "object" && typeof last.text === "string") {
      last.text += "\n\n" + block;
      return true;
    }
  }

  system.push({ type: "text", text: block });
  return true;
}

export function commandArguments(input) {
  const prompt = input?.prompt;
  if (typeof prompt?.text === "string") return prompt.text.trim();
  if (typeof input?.arguments === "string") return input.arguments.trim();
  return "";
}

export function expandTemplate(template, args) {
  return String(template).replace(/\$ARGUMENTS/g, args ?? "");
}

function cleanupRegistration(registration) {
  if (typeof registration === "function") return registration;
  if (!registration || typeof registration !== "object") return undefined;
  for (const key of ["dispose", "unsubscribe", "close"]) {
    if (typeof registration[key] === "function") return registration[key].bind(registration);
  }
  return undefined;
}

// Build the OpenCode 2 runtime. Keeping it as a factory (rather than doing
// everything inside setup) makes the wiring testable with a fake context.
export function createPlainNativeRuntime(ctx, options = {}) {
  const storage = options.storage ?? ctx?.storage;
  let active = defaultMode() === "on";
  let disposed = false;
  const seenSessions = new Set();
  const registrations = [];
  const lifecycle = new AbortController();

  async function readPersisted() {
    if (!storage || typeof storage.get !== "function") return undefined;
    try {
      const value = await storage.get(PLAIN_STORAGE_KEY);
      if (typeof value === "boolean") return value;
      if (typeof value === "string") {
        if (value === "on") return true;
        if (value === "off") return false;
      }
      if (value && typeof value === "object" && typeof value.active === "boolean") {
        return value.active;
      }
    } catch {}
    return undefined;
  }

  async function persist(on) {
    if (!storage) return;
    try {
      if (on) {
        if (typeof storage.set === "function") await storage.set(PLAIN_STORAGE_KEY, { active: true });
      } else if (typeof storage.remove === "function") {
        await storage.remove(PLAIN_STORAGE_KEY);
      }
    } catch {}
  }

  async function setActive(on) {
    active = on;
    await persist(on);
    debug("intent " + (on ? "on" : "off"));
  }

  async function applyDefault() {
    active = defaultMode() === "on";
    await persist(active);
    debug("session default -> " + defaultMode());
  }

  // OpenCode 2 emits `session.created` on the event stream, but not every
  // surface (e.g. `opencode run`) publishes it. Track sessions on first sight
  // as well so a fresh session always starts from the default.
  async function observeSession(sessionID) {
    if (typeof sessionID !== "string" || !sessionID || seenSessions.has(sessionID)) return;
    seenSessions.add(sessionID);
    await applyDefault();
  }

  async function onPrompt(event) {
    if (disposed) return;
    await observeSession(event?.sessionID);
    const text = typeof event?.prompt?.text === "string" ? event.prompt.text : "";
    const intent = parseIntent(text);
    if (intent === "on") await setActive(true);
    else if (intent === "off") await setActive(false);
  }

  async function onContext(event) {
    if (disposed) return;
    if (active) {
      injectRulesIntoSystem(event?.system);
      const parts = Array.isArray(event?.system) ? event.system : [];
      const present = parts.some((part) => {
        const text = typeof part === "string" ? part : part?.text;
        return typeof text === "string" && text.includes(BANNER);
      });
      debug("rules injected (marker=" + present + ", parts=" + parts.length + ")");
    }
  }

  function watchEvents() {
    if (typeof ctx?.event?.subscribe !== "function") return;
    const attach = async () => {
      try {
        const registration = await ctx.event.subscribe({ signal: lifecycle.signal });
        registrations.push(registration);
        const stream = registration?.stream ?? registration;
        if (!stream || typeof stream[Symbol.asyncIterator] !== "function") return;
        try {
          for await (const event of stream) {
            if (disposed) break;
            if (event?.type === "session.created") {
              await observeSession(event?.data?.sessionID);
            } else if (event?.type === "session.deleted") {
              const sessionID = event?.data?.sessionID;
              if (typeof sessionID === "string") seenSessions.delete(sessionID);
            }
          }
        } catch {}
      } catch {}
    };
    void attach();
  }

  async function registerCommands() {
    return ctx.command.transform((draft) => {
      if (typeof draft?.add !== "function") return;
      for (const [name, definition] of Object.entries(COMMANDS)) {
        draft.add({
          name,
          description: definition.description,
          execute: async (input) => {
            await observeSession(input?.sessionID);
            const text = expandTemplate(definition.template, commandArguments(input));
            debug("command /" + name + " -> session.prompt");
            await ctx.session.prompt({ sessionID: input?.sessionID, text, delivery: "queue" });
          },
        });
      }
    });
  }

  async function register() {
    if (disposed) throw new Error("Plain English (OpenCode 2) is disposed");
    if (typeof ctx?.command?.transform !== "function") {
      throw new Error("Plain English (OpenCode 2) requires context.command.transform");
    }
    if (typeof ctx?.session?.hook !== "function") {
      throw new Error("Plain English (OpenCode 2) requires context.session.hook");
    }

    const persisted = await readPersisted();
    if (persisted === undefined) await persist(active);
    else active = persisted;

    registrations.push(await registerCommands());
    registrations.push(await ctx.session.hook("prompt", onPrompt));
    registrations.push(await ctx.session.hook("context", onContext));
    watchEvents();
    debug("v2 ready (" + Object.keys(COMMANDS).join(", ") + ")");
  }

  async function cleanup() {
    if (disposed) return;
    disposed = true;
    try {
      lifecycle.abort();
    } catch {}
    for (const registration of [...registrations].reverse()) {
      const dispose = cleanupRegistration(registration);
      if (!dispose) continue;
      try {
        await dispose();
      } catch {}
    }
    debug("cleanup");
  }

  return {
    register,
    cleanup,
    isActive: () => active,
    setActive,
    applyDefault,
    onPrompt,
    onContext,
  };
}

export async function setupPlain(ctx) {
  const runtime = createPlainNativeRuntime(ctx);
  try {
    await runtime.register();
  } catch (error) {
    await runtime.cleanup().catch(() => {});
    throw error;
  }
  return () => runtime.cleanup();
}

export const PlainNativePlugin = define(Object.freeze({
  id: PLAIN_PLUGIN_ID,
  setup: setupPlain,
}));

export default PlainNativePlugin;
