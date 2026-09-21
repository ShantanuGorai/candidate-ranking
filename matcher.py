import re
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

model = SentenceTransformer("all-MiniLM-L6-v2")

def clean_text(text):
    text = str(text).lower()
    text = re.sub(r"\s+", " ", text)
    return text.strip()

def normalize_skill_name(skill):
    skill = clean_text(skill)
    skill = re.sub(r"[^a-z0-9+#.\- ]", "", skill)
    return skill.strip()

def prepare_skills(skills):
    if not skills:
        return []

    result = []

    for skill in skills:
        skill = normalize_skill_name(skill)

        if skill and skill not in result:
            result.append(skill)

    return result

def exact_skill_match(
    jd_skills,
    candidate_skills
):
    jd_skills = prepare_skills(jd_skills)
    candidate_skills = prepare_skills(
        candidate_skills
    )

    matched = []
    missing = []

    candidate_set = set(candidate_skills)

    for skill in jd_skills:
        if skill in candidate_set:
            matched.append(skill)
        else:
            missing.append(skill)

    return {
        "matched": matched,
        "missing": missing,
        "match_count": len(matched),
        "required_count": len(jd_skills)
    }

def semantic_skill_match(
    jd_skills,
    candidate_skills,
    threshold=0.70
):
    jd_skills = prepare_skills(jd_skills)
    candidate_skills = prepare_skills(
        candidate_skills
    )

    if not jd_skills:
        return {
            "matched": [],
            "missing": [],
            "additional": []
        }

    if not candidate_skills:
        return {
            "matched": [],
            "missing": jd_skills,
            "additional": []
        }

    jd_embeddings = model.encode(
        jd_skills,
        normalize_embeddings=True
    )

    candidate_embeddings = model.encode(
        candidate_skills,
        normalize_embeddings=True
    )

    similarity_matrix = cosine_similarity(
        jd_embeddings,
        candidate_embeddings
    )

    matched = []
    missing = []
    used_candidates = set()

    for i, jd_skill in enumerate(jd_skills):
        best_index = similarity_matrix[i].argmax()
        best_score = float(
            similarity_matrix[i][best_index]
        )

        candidate_skill = candidate_skills[
            best_index
        ]

        if best_score >= threshold:
            matched.append({
                "required_skill": jd_skill,
                "candidate_skill": candidate_skill,
                "similarity": round(
                    best_score,
                    4
                )
            })

            used_candidates.add(best_index)
        else:
            missing.append({
                "skill": jd_skill,
                "best_candidate_match": candidate_skill,
                "similarity": round(
                    best_score,
                    4
                )
            })

    additional = [
        skill
        for index, skill in enumerate(
            candidate_skills
        )
        if index not in used_candidates
    ]

    return {
        "matched": matched,
        "missing": missing,
        "additional": additional
    }

def calculate_skill_match_score(
    required_skills,
    candidate_skills,
    threshold=0.70
):
    result = semantic_skill_match(
        required_skills,
        candidate_skills,
        threshold
    )

    total = len(required_skills)

    if total == 0:
        return 0.0

    score = (
        len(result["matched"])
        / total
    ) * 100

    return round(score, 2)

def semantic_text_match(
    jd_text,
    candidate_text
):
    jd_text = clean_text(jd_text)
    candidate_text = clean_text(
        candidate_text
    )

    if not jd_text or not candidate_text:
        return 0.0

    embeddings = model.encode(
        [
            jd_text,
            candidate_text
        ],
        normalize_embeddings=True
    )

    score = cosine_similarity(
        [embeddings[0]],
        [embeddings[1]]
    )[0][0]

    return round(
        float(score),
        4
    )

def extract_required_experience(jd_text):
    patterns = [
        r"(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?experience",
        r"minimum\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*(?:years?|yrs?)",
        r"at least\s+(\d+(?:\.\d+)?)\s*(?:years?|yrs?)"
    ]

    values = []

    for pattern in patterns:
        matches = re.findall(
            pattern,
            jd_text,
            re.IGNORECASE
        )

        for match in matches:
            values.append(float(match))

    return max(values) if values else None

def calculate_experience_match(
    required_years,
    candidate_years
):
    if required_years is None:
        return {
            "required_years": None,
            "candidate_years": candidate_years,
            "score": 100.0,
            "meets_requirement": True
        }

    if candidate_years is None:
        return {
            "required_years": required_years,
            "candidate_years": 0.0,
            "score": 0.0,
            "meets_requirement": False
        }

    if candidate_years >= required_years:
        score = 100.0
        meets_requirement = True
    else:
        score = (
            candidate_years
            / required_years
        ) * 100

        meets_requirement = False

    return {
        "required_years": required_years,
        "candidate_years": round(
            candidate_years,
            2
        ),
        "score": round(
            min(score, 100.0),
            2
        ),
        "meets_requirement": meets_requirement
    }

def build_candidate_text(candidate):
    parts = []

    parts.extend(
        candidate.get("skills", [])
    )

    parts.extend(
        candidate.get("education", [])
    )

    parts.extend(
        candidate.get("certifications", [])
    )

    parts.extend(
        candidate.get("projects", [])
    )

    experience = candidate.get(
        "experience",
        {}
    )

    for item in experience.get(
        "experiences",
        []
    ):
        parts.append(
            item.get("role") or ""
        )

        parts.append(
            item.get("company") or ""
        )

        parts.append(
            item.get("description") or ""
        )

        parts.extend(
            item.get("skills") or []
        )

    return clean_text(
        " ".join(parts)
    )

def match_candidate(
    jd,
    candidate,
    skill_threshold=0.70
):
    required_skills = prepare_skills(
        jd.get("required_skills", [])
    )

    preferred_skills = prepare_skills(
        jd.get("preferred_skills", [])
    )

    candidate_skills = prepare_skills(
        candidate.get("skills", [])
    )

    required_result = semantic_skill_match(
        required_skills,
        candidate_skills,
        skill_threshold
    )

    preferred_result = semantic_skill_match(
        preferred_skills,
        candidate_skills,
        skill_threshold
    )

    required_skill_score = calculate_skill_match_score(
        required_skills,
        candidate_skills,
        skill_threshold
    )

    preferred_skill_score = calculate_skill_match_score(
        preferred_skills,
        candidate_skills,
        skill_threshold
    )

    jd_text = clean_text(
        jd.get("description", "")
    )

    candidate_text = build_candidate_text(
        candidate
    )

    semantic_score = semantic_text_match(
        jd_text,
        candidate_text
    )

    experience_data = candidate.get(
        "experience",
        {}
    )

    candidate_years = experience_data.get(
        "estimated_years",
        0
    )

    required_years = jd.get(
        "required_experience"
    )

    if required_years is None:
        required_years = extract_required_experience(
            jd_text
        )

    experience_result = calculate_experience_match(
        required_years,
        candidate_years
    )

    return {
    "candidate_id": candidate.get(
        "candidate_id"
    ),
    "candidate_name": candidate.get(
        "name"
    ),
    "required_skills": {
        "matched": required_result["matched"],
        "missing": required_result["missing"],
        "score": required_skill_score
    },
    "preferred_skills": {
        "matched": preferred_result["matched"],
        "missing": preferred_result["missing"],
        "additional_skills": preferred_result["additional"],
        "score": preferred_skill_score
    },
    "semantic_similarity": semantic_score,
    "experience": experience_result,
    "additional_skills": preferred_result["additional"],
    "candidate_skills": candidate_skills
}
        

if __name__ == "__main__":
    jd = {
        "required_skills": [
            "Python",
            "FastAPI",
            "PostgreSQL",
            "Docker"
        ],
        "preferred_skills": [
            "Machine Learning",
            "AWS"
        ],
        "description": """
        Python Backend Developer with 3 years
        of experience. Strong experience with
        FastAPI, PostgreSQL, Docker and REST APIs.
        Machine Learning knowledge is preferred.
        """,
        "required_experience": 3
    }

    candidate = {
        "candidate_id": "candidate_01",
        "name": "Shantanu Gorai",
        "skills": [
            "Python",
            "FastAPI",
            "PostgreSQL",
            "Docker",
            "Machine Learning",
            "React"
        ],
        "education": [
            "Bachelor of Engineering in Computer Science"
        ],
        "certifications": [
            "AWS Cloud Practitioner"
        ],
        "projects": [
            "AI powered job application system"
        ],
        "experience": {
            "estimated_years": 3.5,
            "experiences": [
                {
                    "role": "Python Developer",
                    "company": "ABC Technologies",
                    "months": 42,
                    "skills": [
                        "Python",
                        "FastAPI",
                        "PostgreSQL",
                        "Docker"
                    ],
                    "description": """
                    Developed backend APIs using
                    Python and FastAPI.
                    """
                }
            ]
        }
    }

    result = match_candidate(
        jd,
        candidate
    )

    import json

    print(
        json.dumps(
            result,
            indent=4,
            ensure_ascii=False
        )
    )