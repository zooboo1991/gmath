/**
 * The one input style every admin filter and form field shares.
 *
 * It began as a module const in the old single-file dashboard, then got
 * hand-copied into five components as panels were split out — identical to the
 * byte in each, which is how a "let's soften the focus ring" tweak turns into
 * five edits and one that gets missed.
 */
export const INPUT_CLASS =
  "w-full px-3.5 py-2.5 rounded-xs border-[1.5px] border-line-2 bg-surface-2 text-ink font-semibold text-[.88rem] focus:outline-none focus:border-blue focus:bg-surface";
