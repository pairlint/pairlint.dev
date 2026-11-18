// Every text and background pair on the site must meet WCAG 2.2 AA in light and dark.
// The ratios are compared exactly, the same way pairlint does: 4.499 does not pass 4.5.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

const BODY = 4.5;
const UI = 3;

// [foreground, background, minimum, what it is]
const PAIRS = [
  ...["--bg", "--surface", "--surface-strong"].flatMap((bg) => [
    ["--text", bg, BODY, "body text"],
    ["--text-muted", bg, BODY, "secondary text"],
    ["--accent", bg, BODY, "links and eyebrows"],
    ["--accent", bg, UI, "focus ring"],
  ]),
  ...["--bg", "--surface"].flatMap((bg) => [
    ["--accent-strong", bg, BODY, "link hover"],
    ["--pass", bg, BODY, "pass labels"],
    ["--fail", bg, BODY, "fail labels"],
    ["--border-strong", bg, UI, "outlines that carry meaning"],
  ]),
  ["--on-accent", "--accent", BODY, "primary button"],
  ["--on-accent", "--accent-strong", BODY, "primary button hover"],
  ["--pass", "--pass-bg", BODY, "pass badge"],
  ["--fail", "--fail-bg", BODY, "fail badge"],
  ["--term-text", "--term-bg", BODY, "terminal text"],
  ["--term-dim", "--term-bg", BODY, "terminal comments"],
  ["--term-pass", "--term-bg", BODY, "terminal pass"],
  ["--term-fail", "--term-bg", BODY, "terminal fail"],
  ["--term-warn", "--term-bg", BODY, "terminal warning"],
  ["--term-accent", "--term-bg", BODY, "terminal suggestion"],
  ["--term-dim", "--term-bg", UI, "terminal window dots"],
];

function block(source, start) {
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return { body: source.slice(open + 1, i), end: i + 1 };
  }
  throw new Error("Unclosed block");
}

function declarations(body) {
  const out = {};
  for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[name] = value.trim();
  return out;
}

export function tokens() {
  const rootAt = css.indexOf(":root");
  const light = block(css, rootAt);
  const mediaAt = css.indexOf("@media (prefers-color-scheme: dark)");
  assert.ok(mediaAt > 0, "styles.css needs a prefers-color-scheme: dark block");
  const media = block(css, mediaAt);
  const darkRoot = block(media.body, media.body.indexOf(":root"));
  const lightTokens = declarations(light.body);
  return {
    light: lightTokens,
    dark: { ...lightTokens, ...declarations(darkRoot.body) },
    tokenBlocks: [
      [rootAt, light.end],
      [mediaAt, media.end],
    ],
  };
}

function resolve(mode, name, seen = new Set()) {
  const value = mode[name];
  assert.ok(value, `${name} is not defined`);
  const alias = value.match(/^var\((--[\w-]+)\)$/);
  if (alias) {
    assert.ok(!seen.has(name), `${name} is a circular alias`);
    seen.add(name);
    return resolve(mode, alias[1], seen);
  }
  return value;
}

export function hexToRgb(hex) {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  assert.ok(m, `Expected a 6-digit hex color, got ${hex}`);
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function ratio(fgHex, bgHex) {
  const a = luminance(hexToRgb(fgHex));
  const b = luminance(hexToRgb(bgHex));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const { light, dark, tokenBlocks } = tokens();

for (const [modeName, mode] of [
  ["light", light],
  ["dark", dark],
]) {
  test(`every pair meets WCAG AA in ${modeName}`, () => {
    const failures = [];
    for (const [fg, bg, min, what] of PAIRS) {
      const fgHex = resolve(mode, fg);
      const bgHex = resolve(mode, bg);
      const r = ratio(fgHex, bgHex);
      if (!(r >= min)) failures.push(`${fg} on ${bg} (${what}): ${r.toFixed(3)}:1, needs ${min}:1`);
    }
    assert.deepEqual(failures, []);
  });
}

test("both themes define the same tokens", () => {
  const darkOnly = Object.keys(dark).filter((k) => !(k in light));
  assert.deepEqual(darkOnly, []);
});

test("colors only appear in the token blocks and the swatch block", () => {
  const swatchStart = css.indexOf("/* swatch-colors:start");
  const swatchEnd = css.indexOf("/* swatch-colors:end */");
  assert.ok(swatchStart > 0 && swatchEnd > swatchStart, "swatch markers are missing");
  const allowed = [...tokenBlocks, [swatchStart, swatchEnd]];
  const stray = [];
  for (const m of css.matchAll(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|color)\(/gi)) {
    if (!allowed.some(([s, e]) => m.index >= s && m.index < e)) {
      const line = css.slice(0, m.index).split("\n").length;
      stray.push(`styles.css:${line} ${m[0]}`);
    }
  }
  assert.deepEqual(stray, []);
});

test("the ratio math matches known WCAG values", () => {
  assert.equal(ratio("#000000", "#ffffff"), 21);
  assert.equal(ratio("#ffffff", "#ffffff"), 1);
  // #767676 on white is the classic lightest gray that passes 4.5:1.
  assert.ok(ratio("#767676", "#ffffff") >= 4.5);
  assert.ok(ratio("#777777", "#ffffff") < 4.5);
});

test("ratios quoted on the page match the colors shown", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  // pairlint truncates to two decimals, so a quoted ratio never rounds up.
  const truncate = (r) => (Math.floor(r * 100) / 100).toFixed(2);
  const quoted = [
    ["#475569", "#ffffff", "7.57"],
    ["#80868b", "#202124", "4.37"],
    ["#9aa0a6", "#202124", "6.09"],
    ["#64748b", "#1e293b", "3.07"],
    ["#94a3b8", "#1e293b", "5.70"],
    ["#03a14a", "#ffffff", "3.38"],
  ];
  for (const [fg, bg, shown] of quoted) {
    assert.equal(truncate(ratio(fg, bg)), shown, `${fg} on ${bg}`);
    assert.ok(html.includes(`${shown}:1`), `index.html should quote ${shown}:1`);
  }
});
