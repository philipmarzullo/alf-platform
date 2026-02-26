/**
 * Generate a URL-safe slug from a company name.
 * e.g. "A&A Elevated Facility Solutions" -> "aa-elevated-facility-solutions"
 */
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/&/g, '-and-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}
