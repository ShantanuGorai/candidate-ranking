from JD_parsing import select_jd, parse_jd
from resume_parser import select_resumes, parse_multiple_resumes
from matcher import match_candidate
from scorer import score_candidate
from candidate_ranking import (
    rank_candidates,
    save_ranked_candidates
)
import json

jd_file = select_jd()

if not jd_file:
    print("No job description selected.")
    exit()

resume_files = select_resumes()

if not resume_files:
    print("No resumes selected.")
    exit()

print("\nParsing job description...")

jd = parse_jd(jd_file)

print("Job description parsed successfully.")

print(
    f"\nParsing {len(resume_files)} resume(s)..."
)

candidates = parse_multiple_resumes(
    resume_files
)

results = []

for candidate in candidates:
    if "error" in candidate:
        results.append(candidate)
        continue

    print(
        f"Matching {candidate.get('name', 'Unknown Candidate')}..."
    )

    match_result = match_candidate(
        jd,
        candidate
    )

    score_result = score_candidate(
        match_result,
        candidate,
        jd
    )

    results.append(
        score_result
    )

with open(
    "ranking_results.json",
    "w",
    encoding="utf-8"
) as file:
    json.dump(
        results,
        file,
        indent=4,
        ensure_ascii=False
    )

ranked_results = rank_candidates(
    results
)

save_ranked_candidates(
    ranked_results,
    "ranked_candidates.json"
)

print("\nFinal Candidate Ranking:\n")

for candidate in ranked_results:
    print(
        f"Rank {candidate['rank']}: "
        f"{candidate.get('candidate_name', 'Unknown')} "
        f"- {candidate['score']}"
    )

print(
    "\nResults saved to ranking_results.json"
)

print(
    "Ranked candidates saved to ranked_candidates.json"
)