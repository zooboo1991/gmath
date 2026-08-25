/**
 * The times a family can tick, rather than describe.
 *
 * The first three people to use the form left the note empty and pressed
 * send — a free-text box on a phone gets skipped. These are stored inside
 * `note` (comma-separated, with anything they typed appended) so no schema
 * change is needed and old rows still read correctly.
 *
 * Kept in its own module, free of any database import, so the public form
 * (a client component) can name the same options the server does.
 */
export const WAITLIST_TIME_OPTIONS = [
  "Ажлын өдрийн өглөө",
  "Ажлын өдрийн өдөр",
  "Ажлын өдрийн орой",
  "Амралтын өдөр",
] as const;

