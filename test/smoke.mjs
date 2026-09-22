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
});
