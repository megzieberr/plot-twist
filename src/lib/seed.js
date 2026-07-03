// Seed the database from src/data/seed.json (section 4 of the brief).
// Tries an API lookup per title to attach posters/metadata; falls back to a
// bare row if the API is unreachable, so seeding always succeeds.

import seedData from '../data/seed.json';
import { backend } from './backend.js';
import { searchAny } from './api.js';

export async function runSeed(onProgress) {
  const existingTitles = await backend.getTitles();
  const existingRatings = await backend.getRatings();
  const ratedTitleIds = new Set(existingRatings.map((r) => r.title_id));
  let done = 0;

  for (const row of seedData) {
    done += 1;
    onProgress?.(done, seedData.length, row.title);

    // Idempotent: a title that already has a rating is skipped — unless its
    // poster is missing (seeded offline / before the TMDB key existed), in
    // which case only its metadata is refreshed and the verdict is untouched.
    const already = existingTitles.find(
      (t) => t.title.toLowerCase() === row.title.toLowerCase() && t.media_type === row.media_type
    );
    const alreadyRated = already && ratedTitleIds.has(already.id);
    if (alreadyRated && already.poster_url) continue;

    let meta = null;
    try {
      const results = await searchAny(row.media_type, row.title);
      meta =
        results.find((r) => r.year === row.year) ||
        results.find((r) => Math.abs((r.year || 0) - row.year) <= 1) ||
        results[0] ||
        null;
    } catch {
      meta = null; // offline / no key yet — seed bare
    }

    const titleRow = await backend.upsertTitle({
      media_type: row.media_type,
      external_source: meta?.external_source || 'manual',
      external_id: meta?.external_id || null,
      title: row.title,
      year: meta?.year ?? row.year,
      poster_url: meta?.poster_url || null,
      overview: meta?.overview || '',
      genres: meta?.genres || [],
      keywords: meta?.keywords || [],
      axes: row.axes, // hand-tagged axes from the brief are the source of truth
      flags: row.verdict === 'avoid' ? ['addiction_central'] : [],
    });
    if (!alreadyRated) {
      await backend.rate(titleRow.id, row.media_type, row.verdict, row.note || '');
    }
  }
  return seedData.length;
}
