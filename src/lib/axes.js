// The taste axes — the real features of the recommender.
// API genres are too coarse, so candidates are scored against these.

export const AXES = {
  unexplained_no_resolution: {
    label: 'Unexplained mystery',
    why: 'a strange phenomenon that is never tidily explained',
  },
  unreliable_narrator: {
    label: 'Unreliable narrator',
    why: 'a POV you cannot trust',
  },
  recontextualising_twist: {
    label: 'Recontextualising twist',
    why: 'a reveal that rewrites everything before it',
  },
  survival_dystopia: {
    label: 'Survival / dystopia',
    why: 'survival stakes in a collapsing world',
  },
  transformation_arc: {
    label: 'Transformation arc',
    why: 'a character who becomes something fundamentally different',
  },
  deep_villain: {
    label: 'Deep villain',
    why: 'a complex, well-built antagonist',
  },
  mystery_no_spoonfeed: {
    label: 'Mystery that trusts you',
    why: 'a mystery that does not over-explain',
  },
  comfort_nostalgia: {
    label: 'Comfort & nostalgia',
    why: 'warm, familiar, rewatchable',
  },
  prestige_high_craft: {
    label: 'Prestige craft',
    why: 'high production and writing quality',
  },
  natural_humour: {
    label: 'Natural humour',
    why: 'humour that feels organic, never forced',
  },
};

export const AXIS_KEYS = Object.keys(AXES);

// Negative flags push a candidate down.
export const NEGATIVE_FLAGS = {
  slow_pacing: 'Slow pacing',
  forced_humour: 'Forced humour',
  bad_animation: 'Weak animation', // anime only
  addiction_central: 'Addiction-central (filtered)', // hard exclude, see content filters
};

// ---------------------------------------------------------------------------
// Axis inference: map raw API signals (TMDB keywords/genres, AniList tags)
// onto the taste axes. Each rule is [regex, confidence 0..1].
// Confidence caps at 1 per axis after summing rule hits.
// ---------------------------------------------------------------------------

const RULES = {
  unexplained_no_resolution: [
    [/ambiguous end/i, 0.9],
    [/open end/i, 0.8],
    [/unexplained|inexplicable/i, 0.9],
    [/surreal/i, 0.5],
    [/cosmic horror|lovecraft/i, 0.7],
    [/paranormal|supernatural/i, 0.4],
    [/mysterious (phenomenon|force|island|place)/i, 0.8],
    [/liminal/i, 0.6],
  ],
  unreliable_narrator: [
    [/unreliable narrator/i, 1.0],
    [/gaslight/i, 0.7],
    [/memory loss|amnesia/i, 0.6],
    [/hallucination|delusion/i, 0.7],
    [/split personality|dissociative/i, 0.7],
    [/psychological thriller/i, 0.5],
    [/paranoia/i, 0.5],
  ],
  recontextualising_twist: [
    [/plot twist|twist end/i, 1.0],
    [/surprise end/i, 0.9],
    [/nonlinear timeline|non-linear/i, 0.5],
    [/mind[- ]?bend/i, 0.7],
    [/time loop|time travel/i, 0.4],
    [/simulated reality|simulation/i, 0.6],
    [/hidden identity|secret identity/i, 0.4],
  ],
  survival_dystopia: [
    [/dystopia/i, 1.0],
    [/post[- ]?apocalyp/i, 0.9],
    [/survival/i, 0.8],
    [/pandemic|outbreak|plague/i, 0.6],
    [/totalitarian|police state|surveillance state/i, 0.7],
    [/end of the world|apocalypse/i, 0.8],
    [/wilderness|stranded|deserted island/i, 0.5],
    [/battle royale|death game/i, 0.8],
    [/zombie/i, 0.5],
  ],
  transformation_arc: [
    [/transformation/i, 0.8],
    [/coming of age/i, 0.4],
    [/anti[- ]?hero/i, 0.5],
    [/rise to power|power fantasy/i, 0.7],
    [/level(ling|ing)? up|rpg mechanics|leveling/i, 0.7],
    [/metamorphosis|becomes a monster|monster protagonist/i, 0.8],
    [/corruption arc|descent into/i, 0.8],
    [/superpower|awakened power/i, 0.5],
  ],
  deep_villain: [
    [/charismatic villain|sympathetic villain|complex villain/i, 1.0],
    [/serial killer/i, 0.6],
    [/cat and mouse/i, 0.7],
    [/anti[- ]?villain/i, 0.8],
    [/mastermind/i, 0.6],
    [/psychopath|sociopath/i, 0.5],
    [/villain/i, 0.3],
  ],
  mystery_no_spoonfeed: [
    [/conspiracy/i, 0.7],
    [/mystery/i, 0.6],
    [/detective|investigation|whodunit/i, 0.5],
    [/cryptic|enigma/i, 0.7],
    [/slow burn mystery/i, 0.7],
    [/secret organization|secret society/i, 0.5],
    [/thriller/i, 0.3],
  ],
  comfort_nostalgia: [
    // Generic genre words kept low: "family"/"friendship" alone must not fire
    // this axis, or every animated blockbuster tops the deck.
    [/feel[- ]?good/i, 0.7],
    [/heartwarming|wholesome/i, 0.6],
    [/nostalgia|nostalgic/i, 0.7],
    [/slice of life|iyashikei/i, 0.5],
    [/romantic comedy|romcom/i, 0.5],
    [/family/i, 0.15],
    [/christmas|holiday/i, 0.3],
    [/friendship/i, 0.12],
  ],
  prestige_high_craft: [
    [/award[- ]?winning/i, 0.7],
    [/critically acclaimed/i, 0.7],
    [/prestige/i, 0.8],
    [/based on true story|biograph/i, 0.3],
    [/auteur|arthouse/i, 0.5],
  ],
  natural_humour: [
    // "comedy" as a bare genre is weak evidence — forced humour is also comedy.
    [/comedy/i, 0.25],
    [/satire|parody/i, 0.6],
    [/dark comedy|black comedy/i, 0.7],
    [/witty|deadpan/i, 0.7],
    [/absurd/i, 0.5],
    [/gag humor|gag comedy/i, 0.4],
  ],
};

const FLAG_RULES = {
  addiction_central: [
    [/drug addict/i, 1.0],
    [/heroin|opioid|meth\b/i, 0.9],
    [/\baddiction\b/i, 0.9],
    [/substance abuse/i, 0.9],
    [/alcoholism/i, 0.8],
    [/drugs/i, 0.6], // AniList tag "Drugs"
  ],
  slow_pacing: [
    [/slow burn/i, 0.6],
    [/slow[- ]?paced/i, 0.9],
    [/episodic/i, 0.4],
  ],
};

// TMDB genre-id → readable string is done in api.js; here we just match text.
// signals: array of strings (keywords, tags, genres). tagRanks: optional map
// of signal → 0..1 relevance (AniList tag rank / 100) used to scale hits.
export function inferAxes(signals, tagRanks = {}) {
  const axes = {};
  const flags = {};
  for (const [axis, rules] of Object.entries(RULES)) {
    let conf = 0;
    for (const s of signals) {
      for (const [re, c] of rules) {
        if (re.test(s)) {
          const scale = tagRanks[s] != null ? tagRanks[s] : 1;
          conf += c * scale;
        }
      }
    }
    if (conf > 0.25) axes[axis] = Math.min(1, conf);
  }
  for (const [flag, rules] of Object.entries(FLAG_RULES)) {
    let conf = 0;
    for (const s of signals) {
      for (const [re, c] of rules) {
        if (re.test(s)) {
          const scale = tagRanks[s] != null ? tagRanks[s] : 1;
          conf += c * scale;
        }
      }
    }
    if (conf > 0.5) flags[flag] = Math.min(1, conf);
  }
  return { axes, flags };
}
