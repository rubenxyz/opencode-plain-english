// Package entrypoint advertised as "./server", which is what OpenCode 2
// resolves for an installed npm package (verified on opencode 2.0.19).
//
// - `server` is the OpenCode 1.x plugin contract (the same function exported
//   by ./plain.js), so one package serves both majors.
// - `setup` is the OpenCode 2.x promise-plugin contract implemented in
//   ./native.js.
import { PlainPlugin } from "./plain.js";
import { PLAIN_PLUGIN_ID, setupPlain } from "./native.js";

const plugin = {
  id: PLAIN_PLUGIN_ID,
  server: PlainPlugin,
  setup: setupPlain,
};

export default plugin;
