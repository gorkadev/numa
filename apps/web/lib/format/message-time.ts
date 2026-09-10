import { format, isSameYear, isToday } from "date-fns"

/**
 * A message's timestamp, at the precision the reader actually needs.
 *
 * Three tiers, because the useful part of a timestamp shrinks the closer it
 * is. Inside a conversation you are still having, the date is noise — every
 * message carries the same one — and the time is the whole signal. A month
 * back, the day is what places it. A year back, the year is.
 *
 * There is no single `date-fns` call for this. `formatRelative` is the closest
 * and produces prose ("yesterday at 10:59"), which is a different thing: it
 * reads as narration in a row that is meant to be glanceable.
 *
 * Formatted in the reader's locale-independent short form on purpose — the
 * rest of this interface is in English, and a row that mixes an English label
 * with a month abbreviated in another language reads as a bug rather than as
 * localisation.
 */
export function formatMessageTime(at: Date): string {
  if (isToday(at)) return format(at, "HH:mm")
  if (isSameYear(at, new Date())) return format(at, "d MMM, HH:mm")

  return format(at, "d MMM yyyy, HH:mm")
}

/**
 * The same moment, spelled out, for the tooltip behind the short form.
 *
 * The short form is lossy by design, so the full one has to be one hover away:
 * "14:25" is unambiguous for about a day, and a thread outlives that.
 */
export function formatMessageTimeLong(at: Date): string {
  return format(at, "PPPP 'at' HH:mm")
}
