# Translating ROG Monitor

ROG Monitor ships in **8 languages**: `en, es, fr, it, pt, zh, ja, ko`.
Adding or fixing a translation is just editing JavaScript objects — no build step,
no framework.

## How i18n works

- **Core strings** live in `desktop/renderer/i18n.js` (the `CORE` dictionary).
- **Per-feature strings** are registered by each module via
  `window.i18n.register({...})` inside its own file
  (e.g. `battery.js`, `disks.js`, `diagnostics.js`, `commands.js`, `roadmap.js`).
- At runtime, `window.t('some.key')` returns the string for the active language.
  Missing languages **fall back** to `en`/`es`, so an untranslated key shows in a
  base language rather than breaking.
- Markup uses `data-i18n="some.key"` (text) and
  `data-i18n-attr="title:some.tip"` (attributes); these re-render live on language
  change.

Both shapes are accepted by `register`:

```js
// key → languages (preferred for new code)
window.i18n.register({
  'battery.health': { en: 'Health', es: 'Salud', fr: 'Santé', it: 'Salute',
                      pt: 'Saúde', zh: '健康', ja: '健康度', ko: '건강도' },
});
```

## Add or fix a language

1. Find the key (grep the renderer for the English or Spanish text, or the
   `some.key` id).
2. Add/edit the language entry next to the others. Keep `{n}`-style placeholders
   intact and don't translate technical tokens (`pkexec`, `PL1`, `smartctl`,
   command names — these stay literal).
3. Validate:

   ```sh
   node scripts/validate-i18n.mjs
   ```

   It **fails** if a key is missing a base language (`en`/`es`), if any
   `data-i18n` in `index.html` has no definition, or if a transparency command
   lacks its texts. It **warns** (does not fail) when a non-base language is
   missing, and prints how many per module — that list is the current translation
   debt.

4. (Optional) Run the app and switch languages from the top bar to eyeball it.

## Current translation debt

Some larger modules are currently only complete in `en`/`es` and fall back for the
other six languages. Run `node scripts/validate-i18n.mjs` to see the live counts by
module (today: `power`, `game-session`, `cores`). Finishing these is a great
first contribution — pick a module, fill the six languages, and the warning count
drops.
