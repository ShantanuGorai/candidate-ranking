"""Extra recruiter-facing ML insights built on top of the existing
sentence-embedding model.

Every function that needs embeddings receives an `encode` callable
(list[str] -> array of L2-normalised vectors) instead of loading a model
itself, so the module reuses the model already loaded by matcher.py and
can be unit-tested with a stand-in encoder.
"""

import re

import numpy as np
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA

MIN_SENTENCE_CHARS = 20
MAX_SENTENCE_CHARS = 320
MAX_SENTENCES = 250
EVIDENCE_MIN_SIMILARITY = 0.35
NEAR_MISS_MIN_SIMILARITY = 0.50


# ---------------------------------------------------------------- text ----

def _window_words(text, size=30):
    words = text.split()
    return [
        " ".join(words[i:i + size])
        for i in range(0, len(words), size)
    ]


def split_sentences(text):
    """Split resume section text into sentence-like evidence snippets."""
    parts = re.split(r"(?<=[.!?])\s+|\s[•\-–]\s|[•;\n]", text or "")
    snippets = []

    for part in parts:
        part = part.strip(" -•*▪◦\t")

        if len(part) < MIN_SENTENCE_CHARS:
            continue

        if len(part) > MAX_SENTENCE_CHARS:
            snippets.extend(
                w for w in _window_words(part)
                if len(w) >= MIN_SENTENCE_CHARS
            )
        else:
            snippets.append(part)

    return snippets


def candidate_sentences(candidate):
    seen = set()
    unique = []

    for content in (candidate.get("sections") or {}).values():
        for sentence in split_sentences(content):
            key = sentence.lower()
            if key not in seen:
                seen.add(key)
                unique.append(sentence)

    return unique[:MAX_SENTENCES]


# ------------------------------------------------------------ evidence ----

def analyze_candidate(encode, requirements, requirement_embeddings, candidate):
    """Find, for each JD requirement, the resume sentence that supports it
    best (semantic retrieval).

    Returns (full_evidence_list, candidate_embedding). full_evidence_list
    covers EVERY requirement that cleared the similarity bar (not just the
    best few) -- callers that only want a short display list (e.g. "a few
    pieces of evidence for this candidate") should slice it themselves;
    callers that need full coverage (e.g. "which requirements does this
    whole candidate pool satisfy at all") need the untruncated list. The
    embedding is the normalised mean of the candidate's sentence embeddings
    (or None when the resume had no usable text) and is reused for the
    talent map.
    """
    sentences = candidate_sentences(candidate)

    if not sentences:
        return [], None

    sentence_embeddings = np.asarray(encode(sentences))

    profile = sentence_embeddings.mean(axis=0)
    norm = np.linalg.norm(profile)
    profile = profile / norm if norm else profile

    evidence = []

    if requirements and requirement_embeddings is not None:
        similarities = np.asarray(requirement_embeddings) @ sentence_embeddings.T

        for i, requirement in enumerate(requirements):
            best = int(similarities[i].argmax())
            score = float(similarities[i][best])

            if score >= EVIDENCE_MIN_SIMILARITY:
                evidence.append({
                    "requirement": requirement,
                    "evidence": sentences[best],
                    "similarity": round(score, 3),
                })

    evidence.sort(key=lambda item: -item["similarity"])

    return evidence, profile


# ----------------------------------------------------------- near miss ----

def near_misses(missing_items):
    """Missing required skills that the candidate almost covers, with the
    closest skill found on the resume (transferable-skill hint)."""
    hints = []

    for item in missing_items or []:
        if not isinstance(item, dict):
            continue

        similarity = item.get("similarity") or 0
        closest = item.get("best_candidate_match")

        if closest and similarity >= NEAR_MISS_MIN_SIMILARITY:
            hints.append({
                "skill": item.get("skill"),
                "closest": closest,
                "similarity": round(float(similarity), 3),
            })

    hints.sort(key=lambda h: -h["similarity"])

    return hints


def parse_confidence(candidate):
    """How much can the recruiter trust the automatic parsing of this
    resume? Low confidence means scores may understate the candidate."""
    reasons = []
    score = 100

    skills = candidate.get("skills") or []
    sections = candidate.get("sections") or {}
    years = (candidate.get("experience") or {}).get("estimated_years")

    if len(skills) < 3:
        reasons.append("Very few skills were detected")
        score -= 35

    if len(sections) < 3:
        reasons.append("Resume sections could not be identified clearly")
        score -= 30

    if not years:
        reasons.append("No work experience dates were detected")
        score -= 20

    if not candidate.get("email"):
        reasons.append("No email address was detected")
        score -= 10

    level = "high" if score >= 75 else "medium" if score >= 45 else "low"

    return {"level": level, "score": max(score, 0), "reasons": reasons}


# ---------------------------------------------------------- talent map ----

def build_talent_map(encode, jd_text, entries):
    """Project the JD and every candidate into 2-D (PCA over embeddings).

    `entries` is a list of {"candidate_id", "embedding"}. Candidates that sit
    close to the JD point are semantically closer to the role. With four or
    more candidates they are also clustered (KMeans) into profile groups.
    """
    valid = [e for e in entries if e.get("embedding") is not None]

    if len(valid) < 2 or not jd_text:
        return None

    jd_vector = np.asarray(encode([jd_text[:3000]]))[0]
    jd_norm = np.linalg.norm(jd_vector)
    jd_vector = jd_vector / jd_norm if jd_norm else jd_vector

    candidate_matrix = np.vstack([e["embedding"] for e in valid])
    matrix = np.vstack([jd_vector, candidate_matrix])

    coords = PCA(n_components=2).fit_transform(matrix)
    coords = np.nan_to_num(coords)

    low = coords.min(axis=0)
    span = coords.max(axis=0) - low
    span[span == 0] = 1
    coords = (coords - low) / span

    clusters = [None] * len(valid)

    if len(valid) >= 4:
        k = min(3, len(valid) // 2)
        clusters = [
            int(c) for c in KMeans(
                n_clusters=k, n_init=10, random_state=42
            ).fit_predict(candidate_matrix)
        ]

    points = []

    for i, entry in enumerate(valid):
        similarity = float(candidate_matrix[i] @ jd_vector)
        points.append({
            "candidate_id": entry["candidate_id"],
            "x": round(float(coords[i + 1][0]), 4),
            "y": round(float(coords[i + 1][1]), 4),
            "cluster": clusters[i],
            "jd_similarity": round(similarity, 3),
        })

    return {
        "jd": {
            "x": round(float(coords[0][0]), 4),
            "y": round(float(coords[0][1]), 4),
        },
        "points": points,
    }