import assert from "node:assert/strict";
import { shouldNotify } from "../src/knowledge_bot.js";

assert.equal(shouldNotify("subscriber-7", 3, 4), true);
assert.equal(shouldNotify("subscriber-7", 4, 4), false);
assert.equal(shouldNotify("", 1, 2), false);
console.log("notification decision tests passed");
