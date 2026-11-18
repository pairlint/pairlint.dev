# pairlint.dev

The website for [pairlint](https://github.com/pairlint/pairlint), the free, open-source contrast linter for design tokens.

It is one page of plain HTML and CSS. There is no build step, no JavaScript, no web fonts, no cookies and no analytics, and a strict Content Security Policy keeps it that way.

## Working on it

Open `index.html` in a browser, or serve the folder with any static server:

```sh
npx --yes serve .
```

## Tests

The tests use Node's built-in test runner and need no install.

```sh
npm test
```

They check that:

- Every text and background color pair passes the WCAG 2.2 AA contrast ratios in light and dark. It is a contrast tool, so its own site has to pass.
- Colors only come from the tokens at the top of `styles.css`, so nothing slips past the contrast test.
- Ratios quoted on the page match the colors shown next to them.
- The page has no scripts or inline styles, every link resolves, and every scrollable area works with a keyboard.
- Nothing that is not released yet is presented as available.

## Checked by pairlint

`pairlint.config.json` checks the same color pairs with pairlint itself, reading the tokens straight from `styles.css` in both themes. Once pairlint is on npm, CI will run it next to the tests.

## Changing colors

Edit the tokens in the two blocks at the top of `styles.css` (light first, then the `prefers-color-scheme: dark` override) and add any new pair to `PAIRS` in `test/contrast.test.mjs`. Swatches in the page examples show colors from the pairlint test fixtures. They live between the `swatch-colors` markers and never carry text.

## License

[MIT](LICENSE)
