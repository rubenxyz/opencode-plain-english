import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";

const tmp = mkdtempSync(path.join(tmpdir(), "plain-test-"));
process.env.XDG_CONFIG_HOME = tmp;
delete process.env.PLAIN_DEFAULT;
delete process.env.PLAIN_DEBUG;

const { parseIntent, isActive, setActive, injectRules, PlainPlugin } =
  await import("../src/plain.js");

after(() => rmSync(tmp, { recursive: true, force: true }));

const onCases = [
  "/plain",
  "/plain on",
  "Plain mode request:",
  "Plain mode request: on",
  "plain mode",
  "plain english",
  "plain on",
  "talk in plain english",
  "Can you please speak in plain English?",
  "explain in plain english what the router does",
  '"explain in plain english what the router does"',
  "turn on plain mode",
  "please enable plain english mode",
];

const offCases = [
  "/plain off",
  "Plain mode request: off",
  "stop plain",
  "stop plain mode",
  "normal mode",
  "plain off",
  "disable plain english mode",
  "turn off plain",
];

const nullCases = [
  "",
  "The normal mode of the editor is insert.",
  "How does the plain text format work?",
  "Normal mode is what vim starts in.",
  "don't explain in plain english",
  "please explain the plain text format",
];

test("parseIntent turns plain mode on", () => {
  for (const text of onCases) assert.equal(parseIntent(text), "on", text);
});

test("parseIntent turns plain mode off", () => {
  for (const text of offCases) assert.equal(parseIntent(text), "off", text);
});

test("parseIntent ignores unrelated messages", () => {
  for (const text of nullCases) assert.equal(parseIntent(text), null, text);
});

test("system transform injects the rules once", () => {
  const system = ["base prompt"];
  injectRules(system);
  assert.match(system[0], /^base prompt/);
  assert.match(system[0], /PLAIN MODE ACTIVE/);
  assert.equal(system[0].split("PLAIN MODE ACTIVE").length - 1, 1);
  injectRules(system);
  assert.equal(system[0].split("PLAIN MODE ACTIVE").length - 1, 1);
  const empty = [];
  injectRules(empty);
  assert.equal(empty.length, 1);
  assert.match(empty[0], /PLAIN MODE ACTIVE/);
});

test("config hook registers the commands without clobbering overrides", async () => {
  const hooks = await PlainPlugin();

  const config = {};
  await hooks.config(config);
  assert.deepEqual(Object.keys(config.command).sort(), [
    "plain",
    "plain-commit",
    "plain-review",
  ]);
  assert.match(config.command.plain.template, /\$ARGUMENTS/);
  assert.ok(config.command["plain-commit"].description);

  const preset = { command: { plain: { template: "custom" } } };
  await hooks.config(preset);
  assert.equal(preset.command.plain.template, "custom");
  assert.equal(preset.command["plain-review"].template.includes("plain English"), true);
});

test("plugin hooks switch the mode and inject when active", async () => {
  const hooks = await PlainPlugin();

  await hooks["chat.message"]({}, { parts: [{ type: "text", text: "/plain off" }] });
  assert.equal(isActive(), false);

  const system = ["base prompt"];
  await hooks["experimental.chat.system.transform"]({}, { system });
  assert.equal(system[0], "base prompt");

  await hooks["chat.message"]({}, { parts: [{ type: "text", text: "Plain mode request: " }] });
  assert.equal(isActive(), true);

  await hooks["experimental.chat.system.transform"]({}, { system });
  assert.match(system[0], /PLAIN MODE ACTIVE/);

  await hooks["chat.message"]({}, { parts: [{ type: "text", text: "normal mode" }] });
  assert.equal(isActive(), false);

  await hooks.event({ event: { type: "session.created" } });
  assert.equal(isActive(), true);

  process.env.PLAIN_DEFAULT = "off";
  await hooks.event({ event: { type: "session.created" } });
  assert.equal(isActive(), false);

  setActive(true);
  await hooks["experimental.chat.system.transform"]({}, { system: null });
  assert.equal(isActive(), true);

  delete process.env.PLAIN_DEFAULT;
});

// --- OpenCode 2 (promise plugin API) ---------------------------------------

// The V1 hook test above leaves PLAIN_DEFAULT=off in the environment.
delete process.env.PLAIN_DEFAULT;

const {
  injectRulesIntoSystem,
  createPlainNativeRuntime,
  expandTemplate,
  commandArguments,
  PLAIN_STORAGE_KEY,
  PlainNativePlugin,
} = await import("../src/native.js");

function fakeStorage(initial = []) {
  const map = new Map(initial);
  const sets = [];
  const removes = [];
  return {
    map,
    sets,
    removes,
    async get(key) {
      return map.get(key);
    },
    async set(key, value) {
      map.set(key, value);
      sets.push([key, value]);
    },
    async remove(key) {
      map.delete(key);
      removes.push(key);
    },
  };
}

function createStream() {
  const queue = [];
  const waiters = [];
  let closed = false;
  return {
    push(value) {
      if (waiters.length > 0) waiters.shift()({ value, done: false });
      else queue.push(value);
    },
    close() {
      closed = true;
      while (waiters.length > 0) waiters.shift()({ value: undefined, done: true });
    },
    [Symbol.asyncIterator]() {
      return {
        next() {
          if (queue.length > 0) return Promise.resolve({ value: queue.shift(), done: false });
          if (closed) return Promise.resolve({ value: undefined, done: true });
          return new Promise((resolve) => waiters.push(resolve));
        },
        return() {
          closed = true;
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    },
  };
}

function fakeContext({ storage = fakeStorage() } = {}) {
  const commands = new Map();
  const hooks = new Map();
  const prompts = [];
  const stream = createStream();
  const disposed = [];
  const ctx = {
    storage,
    command: {
      async transform(callback) {
        await callback({ add: (definition) => commands.set(definition.name, definition) });
        return { dispose: () => disposed.push("commands") };
      },
    },
    session: {
      async hook(name, callback) {
        hooks.set(name, callback);
        return { dispose: () => disposed.push(name) };
      },
      async prompt(request) {
        prompts.push(request);
      },
    },
    event: {
      async subscribe() {
        return stream;
      },
    },
  };
  return { ctx, storage, commands, hooks, prompts, stream, disposed };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

test("v2 injectRulesIntoSystem replaces in place and never stacks", () => {
  const strings = ["base prompt"];
  injectRulesIntoSystem(strings);
  assert.match(strings[0], /^base prompt/);
  assert.equal(strings[0].split("PLAIN MODE ACTIVE").length - 1, 1);
  injectRulesIntoSystem(strings);
  assert.equal(strings[0].split("PLAIN MODE ACTIVE").length - 1, 1);

  const parts = [
    { type: "text", text: "base prompt" },
    { type: "text", text: "more context" },
  ];
  injectRulesIntoSystem(parts);
  assert.equal(parts[0].text, "base prompt");
  assert.equal(parts.length, 2);
  assert.match(parts[1].text, /more context[\s\S]*PLAIN MODE ACTIVE/);
  injectRulesIntoSystem(parts);
  assert.equal(parts.length, 2);
  assert.equal(parts[1].text.split("PLAIN MODE ACTIVE").length - 1, 1);

  const empty = [];
  injectRulesIntoSystem(empty);
  assert.equal(empty.length, 1);
  assert.equal(empty[0].type, "text");
  assert.match(empty[0].text, /PLAIN MODE ACTIVE/);
});

test("v2 command argument helpers", () => {
  assert.equal(expandTemplate("Plain mode request: $ARGUMENTS", "off"), "Plain mode request: off");
  assert.equal(expandTemplate("static template", "ignored"), "static template");
  assert.equal(commandArguments({ prompt: { text: "  on  " } }), "on");
  assert.equal(commandArguments({ arguments: "x" }), "x");
  assert.equal(commandArguments({}), "");
});

test("v2 registers the three commands and dispatches them locally", async () => {
  const { ctx, commands, prompts } = fakeContext();
  const runtime = createPlainNativeRuntime(ctx);
  await runtime.register();

  assert.deepEqual([...commands.keys()].sort(), ["plain", "plain-commit", "plain-review"]);
  assert.match(commands.get("plain").description, /plain mode/i);

  await commands.get("plain").execute({ sessionID: "ses_exec", prompt: { text: "off" } });
  assert.equal(prompts.at(-1).sessionID, "ses_exec");
  assert.equal(prompts.at(-1).text.startsWith("Plain mode request: off"), true);

  await commands.get("plain-commit").execute({ sessionID: "ses_exec", prompt: { text: "" } });
  assert.match(prompts.at(-1).text, /commit message/i);

  await runtime.cleanup();
});

test("v2 prompt hook toggles mode and context hook injects while active", async () => {
  const { ctx, hooks, stream } = fakeContext();
  const runtime = createPlainNativeRuntime(ctx);
  await runtime.register();
  assert.equal(runtime.isActive(), true);

  await hooks.get("prompt")({ sessionID: "ses_a", prompt: { text: "/plain off" } });
  assert.equal(runtime.isActive(), false);
  const system = [{ type: "text", text: "base" }];
  await hooks.get("context")({ sessionID: "ses_a", system });
  assert.doesNotMatch(system[0].text, /PLAIN MODE ACTIVE/);

  await hooks.get("prompt")({ sessionID: "ses_a", prompt: { text: "Plain mode request: " } });
  assert.equal(runtime.isActive(), true);
  await hooks.get("context")({ sessionID: "ses_a", system });
  assert.equal(system[0].text.split("PLAIN MODE ACTIVE").length - 1, 1);
  await hooks.get("context")({ sessionID: "ses_a", system });
  assert.equal(system[0].text.split("PLAIN MODE ACTIVE").length - 1, 1);

  await hooks.get("prompt")({ sessionID: "ses_a", prompt: { text: "talk in plain english" } });
  assert.equal(runtime.isActive(), true);
  await hooks.get("prompt")({ sessionID: "ses_a", prompt: { text: "normal mode" } });
  assert.equal(runtime.isActive(), false);

  stream.close();
  await runtime.cleanup();
});

test("v2 resets to the default on a new session and honours PLAIN_DEFAULT", async () => {
  const { ctx, hooks } = fakeContext();
  const runtime = createPlainNativeRuntime(ctx);
  await runtime.register();

  await hooks.get("prompt")({ sessionID: "s1", prompt: { text: "/plain off" } });
  assert.equal(runtime.isActive(), false);
  await hooks.get("prompt")({ sessionID: "s1", prompt: { text: "still here" } });
  assert.equal(runtime.isActive(), false);
  await hooks.get("prompt")({ sessionID: "s2", prompt: { text: "new session" } });
  assert.equal(runtime.isActive(), true);

  process.env.PLAIN_DEFAULT = "off";
  await hooks.get("prompt")({ sessionID: "s3", prompt: { text: "new session" } });
  assert.equal(runtime.isActive(), false);
  delete process.env.PLAIN_DEFAULT;

  await runtime.cleanup();
});

test("v2 persists the flag through context.storage", async () => {
  const storage = fakeStorage([[PLAIN_STORAGE_KEY, { active: false }]]);
  const { ctx, hooks } = fakeContext({ storage });
  const runtime = createPlainNativeRuntime(ctx, { storage });
  await runtime.register();
  assert.equal(runtime.isActive(), false);

  await hooks.get("prompt")({ sessionID: "sx", prompt: { text: "hello" } });
  assert.equal(runtime.isActive(), true);
  assert.deepEqual(storage.map.get(PLAIN_STORAGE_KEY), { active: true });

  await hooks.get("prompt")({ sessionID: "sy", prompt: { text: "normal mode" } });
  assert.equal(runtime.isActive(), false);
  assert.equal(storage.map.has(PLAIN_STORAGE_KEY), false);
  assert.ok(storage.removes.includes(PLAIN_STORAGE_KEY));

  await runtime.cleanup();
});

test("v2 event.subscribe applies the default on session.created", async () => {
  const { ctx, hooks, stream } = fakeContext();
  const runtime = createPlainNativeRuntime(ctx);
  await runtime.register();

  await hooks.get("prompt")({ sessionID: "e1", prompt: { text: "/plain off" } });
  assert.equal(runtime.isActive(), false);

  stream.push({ type: "session.created", data: { sessionID: "e2" } });
  await tick();
  assert.equal(runtime.isActive(), true);

  stream.close();
  await runtime.cleanup();
});

test("v2 cleanup disposes every registration once", async () => {
  const { ctx, disposed, stream } = fakeContext();
  const runtime = createPlainNativeRuntime(ctx);
  await runtime.register();
  await runtime.cleanup();
  await runtime.cleanup();
  assert.equal(disposed.filter((item) => item === "prompt").length, 1);
  assert.equal(disposed.filter((item) => item === "context").length, 1);
  assert.equal(disposed.filter((item) => item === "commands").length, 1);
  stream.close();
});

test("v2 plugin object exposes the OpenCode 2 setup contract", () => {
  assert.equal(PlainNativePlugin.id, "opencode-plain-english");
  assert.equal(typeof PlainNativePlugin.setup, "function");
});
