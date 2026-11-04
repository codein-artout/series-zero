/** Text sanitizers for user- and model-originated text. Pure. */

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const ZW = /[​-‏‪-‮⁠-⁤⁦-⁩﻿­]/g;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}]/gu;

export function stripControl(s: string): string {
  return s.replace(CONTROL, "").replace(ZW, "");
}

export function stripMarkup(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/[`*_#>]{1,}/g, (m) => (m.length > 1 ? "" : m === "#" || m === ">" || m === "`" ? "" : m))
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
}

export function stripUrls(s: string): string {
  return s.replace(URL_RE, "").replace(/\s{2,}/g, " ");
}

export function stripEmoji(s: string): string {
  return s.replace(EMOJI, "");
}

export function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Truncate on a word boundary with an ellipsis. */
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, Math.max(0, max - 1));
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:–—-]+$/, "") + "…";
}

/** Sanitizes a single-line display field from an LLM or a user: no control chars, markup, URLs, emoji. */
export function cleanField(s: string, max: number): string {
  return truncate(collapse(stripEmoji(stripUrls(stripMarkup(stripControl(s))))), max);
}

/** Multiline text (DNA, thesis): keep newlines, drop control/zero-width chars. */
export function cleanMultiline(s: string): string {
  return stripControl(s.replace(/\r\n?/g, "\n"));
}
