import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const html = read("index.html");
const css = read("styles.css");

const attrValues = (attr) => [...html.matchAll(new RegExp(`\\s${attr}="([^"]*)"`, "g"))].map((m) => m[1]);

test("the page has the basics", () => {
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(html, /<title>[^<]+<\/title>/);
  assert.match(html, /<meta name="description" content="[^"]+">/);
  assert.equal(html.match(/<h1[\s>]/g)?.length, 1, "exactly one h1");
  assert.match(html, /<main id="main">/);
  assert.match(html, /href="#main"/, "skip link");
});

test("no scripts, inline styles or event handlers, so the CSP can stay strict", () => {
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /\sstyle="/i);
  assert.doesNotMatch(html, /\son[a-z]+="/i);
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1];
  assert.ok(csp, "missing Content-Security-Policy");
  assert.match(csp, /default-src 'none'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https?:/);
});

test("ids are unique and every in-page link has a target", () => {
  const ids = attrValues("id");
  assert.deepEqual(
    ids.filter((id, i) => ids.indexOf(id) !== i),
    [],
  );
  for (const ref of [...attrValues("href"), ...attrValues("aria-labelledby").flatMap((v) => v.split(" "))]) {
    const id = ref.startsWith("#") ? ref.slice(1) : ref.includes(":") || ref.includes(".") ? null : ref;
    if (id) assert.ok(ids.includes(id), `no element with id "${id}"`);
  }
});

test("local files exist and external links go only to the pairlint GitHub org", () => {
  for (const url of [...attrValues("href"), ...attrValues("src")]) {
    if (url.startsWith("#")) continue;
    if (/^https?:/.test(url)) {
      assert.match(url, /^https:\/\/github\.com\/pairlint\//, `unexpected external link ${url}`);
    } else {
      assert.ok(existsSync(new URL(url, root)), `${url} does not exist`);
    }
  }
});

test("every svg is hidden from screen readers or labelled", () => {
  for (const [tag] of html.matchAll(/<svg[^>]*>/g)) {
    assert.match(tag, /aria-hidden="true"|aria-label="/, tag);
  }
});

test("scrollable regions can be reached with the keyboard", () => {
  for (const [tag] of html.matchAll(/<pre[^>]*>/g)) assert.match(tag, /tabindex="0"/, tag);
  for (const [tag] of html.matchAll(/<div class="table-scroll"[^>]*>/g)) {
    assert.match(tag, /tabindex="0"/);
    assert.match(tag, /aria-label="/);
  }
});

test("every swatch class has a color", () => {
  const used = new Set([...html.matchAll(/\bsw-([0-9a-f]{6})\b/g)].map((m) => m[1]));
  assert.ok(used.size > 0);
  for (const hex of used) {
    assert.ok(css.includes(`.sw-${hex} { background: #${hex}; }`), `missing .sw-${hex}`);
  }
});

test("copy has no em dashes", () => {
  for (const file of ["index.html", "styles.css", "README.md", "test/contrast.test.mjs", "test/html.test.mjs"]) {
    assert.ok(!read(file).includes(String.fromCharCode(0x2014)), `${file} contains an em dash`);
  }
});

test("unreleased things are not presented as available", () => {
  // pairlint is not on npm yet.
  assert.doesNotMatch(html, /npx pairlint|npm install/);
  const roadmap = html.slice(html.indexOf('id="roadmap"'), html.indexOf('id="open-source"'));
  for (const item of ["npm release", "GitHub Action", "pairlint init", "Figma plugin"]) {
    assert.ok(roadmap.includes(item), `${item} should be listed under Coming soon`);
  }
  assert.equal(roadmap.match(/class="soon">Coming soon</g)?.length, 4);
});
