// Deterministic, template-based recruiting assistant. No external API is
// called — everything is derived from the ranking data already loaded on
// the results page, so this works fully offline and needs no API key.

export interface ChatCandidate {
  candidate_id?: string;
  candidate_name?: string;
  rank: number;
  score: number;
  recommendation?: string;
  missing_required_skills?: string[];
  matched_required_skills?: string[];
  matched_preferred_skills?: string[];
  duplicate_of?: string;
  experience_details?: {
    required_years?: number | null;
    candidate_years?: number | null;
  };
  parse_confidence?: { level: "high" | "medium" | "low" };
}

const norm = (s: string) => s.toLowerCase().trim();

/** Find candidates a free-text query refers to, by name or by rank/number. */
export function findMentionedCandidates(
  query: string,
  candidates: ChatCandidate[]
): ChatCandidate[] {
  const q = norm(query);
  const found = new Map<number, ChatCandidate>();

  for (const c of candidates) {
    const name = norm(c.candidate_name ?? "");
    if (!name) continue;

    const firstName = name.split(" ")[0];
    // Require at least the first name (3+ chars) to appear as a whole word,
    // so short/common words in the query don't false-match.
    if (firstName.length >= 3) {
      const re = new RegExp(`\\b${firstName.replace(/[^a-z0-9]/g, "")}\\b`, "i");
      if (re.test(q) || q.includes(name)) {
        found.set(c.rank, c);
      }
    }
  }

  // "candidate 2", "#2", "rank 2", "number 2" — useful in blind mode.
  const rankMatches = q.matchAll(/(?:candidate|rank|number|#)\s*#?(\d+)/g);
  for (const m of rankMatches) {
    const rank = Number(m[1]);
    const candidate = candidates.find((c) => c.rank === rank);
    if (candidate) found.set(candidate.rank, candidate);
  }

  return [...found.values()];
}

const yearsPhrase = (c: ChatCandidate) => {
  const years = c.experience_details?.candidate_years;
  const required = c.experience_details?.required_years;
  if (years === undefined || years === null) return null;
  return required
    ? `${years} yrs experience (role needs ${required})`
    : `${years} yrs experience`;
};

function summarize(c: ChatCandidate): string {
  const bits: string[] = [`score ${Math.round(c.score)}`];
  if (c.recommendation) bits.push(c.recommendation.toLowerCase());
  const years = yearsPhrase(c);
  if (years) bits.push(years);

  const missing = c.missing_required_skills ?? [];
  if (missing.length) {
    bits.push(`missing ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}`);
  } else {
    bits.push("no required skills missing");
  }

  return `${c.candidate_name ?? `Candidate ${c.rank}`} (rank #${c.rank}): ${bits.join(", ")}.`;
}

function decisionVerdict(c: ChatCandidate): string {
  const rec = (c.recommendation ?? "").toLowerCase();
  const missing = (c.missing_required_skills ?? []).length;
  const lowConfidence = c.parse_confidence?.level === "low";

  let verdict: string;
  if (rec === "high") {
    verdict = "This one scores high — you can shortlist him/her with confidence and move straight to an interview.";
  } else if (rec === "good") {
    verdict = "Good score — I'd shortlist and interview, this is a strong contender.";
  } else if (rec === "average") {
    verdict = "Average score — worth an interview to see if the gaps matter for this role, but not a clear front-runner yet.";
  } else if (rec === "below average") {
    verdict = "Below average — only shortlist if you're still building out the pool; there are real gaps to probe in an interview.";
  } else if (missing <= 1) {
    verdict = "The score is low but they're only missing a skill or two — an interview would tell you if that's coachable.";
  } else {
    verdict = "I'd hold off unless you're short on options — several required skills are missing.";
  }

  if (lowConfidence) {
    verdict += " One caveat: parsing confidence on this resume was low, so double-check it manually before deciding.";
  }

  return verdict;
}

function compareTwo(a: ChatCandidate, b: ChatCandidate): string {
  const scoreDiff = Math.abs(a.score - b.score);
  const [higher, lower] = a.score >= b.score ? [a, b] : [b, a];

  const aYears = a.experience_details?.candidate_years ?? null;
  const bYears = b.experience_details?.candidate_years ?? null;
  const aMissing = (a.missing_required_skills ?? []).length;
  const bMissing = (b.missing_required_skills ?? []).length;

  const lines = [summarize(a), summarize(b)];

  if (scoreDiff <= 3) {
    lines.push(
      `They're basically tied on score (${scoreDiff} points apart), so I'd break the tie on specifics: ` +
        `${
          aMissing !== bMissing
            ? `${aMissing < bMissing ? a.candidate_name ?? "the first" : b.candidate_name ?? "the second"} is missing fewer required skills`
            : "skills gaps look similar"
        }${
          aYears !== null && bYears !== null && aYears !== bYears
            ? `, and ${aYears > bYears ? a.candidate_name ?? "the first" : b.candidate_name ?? "the second"} has more relevant experience`
            : ""
        }. Honestly, with scores this close I'd just interview both — the score alone isn't enough signal here.`
    );
  } else {
    lines.push(
      `${higher.candidate_name ?? `Candidate ${higher.rank}`} scores meaningfully higher (by ${Math.round(scoreDiff)} points). ` +
        `Unless ${lower.candidate_name ?? "the other candidate"} brings something the score doesn't capture — like a hard-to-find skill or much more experience — I'd lean toward ${higher.candidate_name ?? `Candidate ${higher.rank}`}.`
    );
  }

  return lines.join("\n\n");
}

export const TRADEOFF_RE = /(more|less|fewer|greater)\s+(experience|skills?)/i;
export const SHORTLIST_RE = /\bwho (should i |to )?shortlist\b|\btop candidates?\b|\bbest candidates?\b/;
export const DUPLICATE_RE = /\bduplicates?\b/;

function tradeoffAdvice(mentioned: ChatCandidate[]): string {
  const base =
    "That's a common trade-off. A few ways to think about it:\n\n" +
    "• Experience signals they've handled real-world messiness and can ramp up fast.\n" +
    "• Skills signal immediate technical fit with less on-the-job learning needed.\n" +
    "• For senior, ambiguous, or leadership-heavy roles, lean toward experience.\n" +
    "• For narrowly technical or tooling-specific roles, lean toward skills.\n\n" +
    "Shortlisting is low-risk — it just buys you an interview to test whether the missing skills are things they can pick up quickly. " +
    "I'd shortlist rather than reject, then use the interview to probe the actual gap before making a hiring call.";

  if (mentioned.length === 1) {
    return `${summarize(mentioned[0])}\n\n${base}\n\n${decisionVerdict(mentioned[0])}`;
  }
  return base;
}

export const FAQ: { pattern: RegExp; answer: string }[] = [
  {
    pattern: /how many (candidates? )?(should i )?\bshortlist\b/,
    answer:
      "There's no fixed number, but a common approach is to shortlist enough for 3–5 interviews per open role — " +
      "wide enough to compare fairly, small enough to stay thorough. Use the score and the missing-skills chips to cut the list down first.",
  },
  {
    pattern: /\b(interview )?questions?\s+(to|should i)\s+ask\b|\bwhat\s+(should i|to)\s+ask\b/,
    answer:
      "Good default structure: 1) a question tied to their strongest matched skill (to confirm depth), " +
      "2) a question tied to their biggest missing skill (to gauge how coachable the gap is), " +
      "3) a behavioral question about a real project. Each candidate's expanded panel already has a few tailored questions generated from their gaps — check the 'Suggested interview questions' section.",
  },
  {
    pattern: /\bred flags?\b/,
    answer:
      "Common ones: a duplicate submission (check the 'Duplicate' tag), low parsing confidence paired with a low score (the resume may just be hard to parse, not actually weak), " +
      "a big experience shortfall on a senior role, or someone missing several must-have skills with no adjacent/transferable skills listed.",
  },
  {
    pattern: /\bsame score\b|\btie\b|\btied\b|\bequal score\b/,
    answer:
      "When scores are tied, I look past the number: fewer missing required skills, more relevant experience, and parsing confidence (a 'low confidence' tag can mean the real fit is understated). " +
      "Name both candidates and ask me directly — e.g. 'Priya vs Raj' — and I'll break it down for you.",
  },
  {
    pattern: /\breference check\b/,
    answer:
      "Once you've shortlisted from here, a reference check is worth focusing on exactly the gaps this tool flagged — ask past managers specifically about the missing skills or the experience shortfall, rather than generic questions.",
  },
  {
    pattern: /\bnotice period\b|\bcounter offer\b|\bsalary\b/,
    answer:
      "That's outside what I can see from the resume/JD match — I can only speak to fit based on skills, experience, and JD alignment. Worth asking the candidate directly early, so it doesn't surprise you after an offer.",
  },
];

const GREETING =
  "Hi! I'm your recruiting assistant. Ask me things like \"Should I shortlist Priya or Raj?\", " +
  "\"He has more experience but fewer skills, should I hire him?\", \"Who should I shortlist?\", " +
  "or just type a skill like \"scikit-learn\" to see how relevant it is to this JD.";

// --- Skill-relevance question detection -----------------------------------
// This intent needs a backend call (semantic similarity against the JD), so
// it's kept separate from getChatReply (which stays fully synchronous). The
// UI layer calls detectSkillQuery() first; if it returns a skill, it awaits
// the /api/skill-relevance lookup instead of calling getChatReply().

const SKILL_QUESTION_PATTERNS: RegExp[] = [
  /how\s+(?:relevant|important|necessary|essential)\s+is\s+(.+?)[\?\.]?$/i,
  /is\s+(.+?)\s+(?:relevant|important|necessary|required|essential)(?:\s+for\s+this\s+(?:role|job))?[\?\.]?$/i,
  /do\s+(?:we|i)\s+need\s+(.+?)(?:\s+for\s+this\s+(?:role|job))?[\?\.]?$/i,
  /relevance\s+of\s+(.+?)[\?\.]?$/i,
];

/** If the message is asking (explicitly, or as a bare skill name/phrase)
 * how relevant some skill is to the JD, returns the extracted skill text.
 * Returns null when the message looks like it's asking about something
 * else (a candidate, a trade-off, an FAQ, etc.) — those still go through
 * the normal synchronous getChatReply() path. */
export function detectSkillQuery(query: string, candidates: ChatCandidate[]): string | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  for (const pattern of SKILL_QUESTION_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match?.[1]?.trim()) {
      return match[1].trim().replace(/^(it|that)$/i, "");
    }
  }

  // Bare-phrase fallback: "scikit-learn", "administrative abilities" typed
  // on their own, with nothing else recognizable about the message.
  const q = norm(trimmed);
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

  if (wordCount > 6) return null;
  if (/^(hi|hey|hello)\b/.test(q)) return null;
  if (trimmed.includes("?") && wordCount > 4) return null; // a real question, not a bare skill
  if (findMentionedCandidates(trimmed, candidates).length > 0) return null;
  if (TRADEOFF_RE.test(q)) return null;
  if (SHORTLIST_RE.test(q)) return null;
  if (DUPLICATE_RE.test(q)) return null;
  if (FAQ.some(({ pattern }) => pattern.test(q))) return null;

  return trimmed;
}

export interface SkillRelevanceResult {
  skill: string;
  category: string;
  necessity: string;
  closest_match?: string | null;
  confidence: number;
}

/** Turns a /api/skill-relevance response into a chat-friendly reply. */
export function formatSkillRelevanceReply(result: SkillRelevanceResult): string {
  const pct = Math.round((result.confidence ?? 0) * 100);
  const lines = [`**${result.skill}** — ${result.category}`, result.necessity];

  if (result.closest_match) {
    lines.push(`Closest match in the JD: "${result.closest_match}" (${pct}% similarity).`);
  } else if (result.category !== "Insufficient data") {
    lines.push(`Best similarity found: ${pct}%.`);
  }

  if (result.category !== "Insufficient data") {
    lines.push("(This is an estimate from text similarity, not a certainty — use your judgment alongside it.)");
  }

  return lines.join("\n\n");
}

export function getChatReply(query: string, candidates: ChatCandidate[]): string {
  const q = norm(query);

  if (!q) return GREETING;

  if (/^(hi|hey|hello)\b/.test(q) && q.length < 12) {
    return GREETING;
  }

  if (!candidates.length) {
    return "I don't have any ranked candidates loaded yet — run a ranking first and I'll be able to help compare them.";
  }

  const mentioned = findMentionedCandidates(query, candidates);

  // Two (or more) named candidates -> direct comparison.
  if (mentioned.length >= 2) {
    return compareTwo(mentioned[0], mentioned[1]);
  }

  // A trade-off question ("more experience but less skills") wins over a
  // single-name summary, since it's asking for a judgment call, not just
  // a lookup.
  if (TRADEOFF_RE.test(q)) {
    return tradeoffAdvice(mentioned);
  }

  if (mentioned.length === 1) {
    const c = mentioned[0];
    return `${summarize(c)}\n\n${decisionVerdict(c)}`;
  }

  if (SHORTLIST_RE.test(q)) {
    const top = [...candidates].sort((a, b) => b.score - a.score).slice(0, 3);
    return (
      "Based on the current scores, I'd start with:\n\n" +
      top.map((c, i) => `${i + 1}. ${summarize(c)}`).join("\n")
    );
  }

  if (DUPLICATE_RE.test(q)) {
    const dupes = candidates.filter((c) => c.duplicate_of);
    if (!dupes.length) return "No likely duplicates were flagged in this batch.";
    return (
      "Flagged as possible duplicates:\n\n" +
      dupes.map((c) => `${c.candidate_name ?? `Candidate ${c.rank}`} — looks like ${c.duplicate_of}`).join("\n")
    );
  }

  for (const { pattern, answer } of FAQ) {
    if (pattern.test(q)) return answer;
  }

  return (
    "I can help compare specific candidates by name, break ties, weigh an experience-vs-skills trade-off, " +
    "suggest who to shortlist, or tell you how relevant a given skill is to this JD. Try something like " +
    "\"Should I hire Priya?\", \"Who should I shortlist?\", or just type a skill name."
  );
}