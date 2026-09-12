/** Titles/IDs as typed or spoken; wrap-quotes and a trailing stop are not part of the name. */
export function songQuery(raw: string): string {
  return raw
    .trim()
    .replace(/^["“'‘]([\s\S]*)["”'’]$/u, "$1")
    .replace(/[.!?]+$/u, "")
    .trim();
}
