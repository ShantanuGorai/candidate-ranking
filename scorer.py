import re

DEFAULT_WEIGHTS = {
    "required_skills": 35,
    "experience": 25,
    "semantic_similarity": 20,
    "education": 10,
    "preferred_skills": 10
}

def normalize_weights(weights):
    total = sum(weights.values())

    if total <= 0:
        raise ValueError(
            "Weight total must be greater than 0."
        )

    return {
        key: (
            value / total
        ) * 100
        for key, value in weights.items()
    }

def calculate_required_skill_score(
    match_result
):
    return float(
        match_result
        .get("required_skills", {})
        .get("score", 0)
    )

def calculate_experience_score(
    match_result
):
    return float(
        match_result
        .get("experience", {})
        .get("score", 0)
    )

def calculate_semantic_score(
    match_result
):
    similarity = float(
        match_result.get(
            "semantic_similarity",
            0
        )
    )

    return max(
        0,
        min(
            similarity * 100,
            100
        )
    )

def calculate_preferred_skill_score(
    match_result
):
    return float(
        match_result
        .get("preferred_skills", {})
        .get("score", 0)
    )

def calculate_education_score(
    candidate,
    jd
):
    required_education = jd.get(
        "education",
        []
    )

    candidate_education = candidate.get(
        "education",
        []
    )

    if not required_education:
        return 100.0

    if not candidate_education:
        return 0.0

    required_text = " ".join(
        required_education
    ).lower()

    candidate_text = " ".join(
        candidate_education
    ).lower()

    required_words = set(
        re.findall(
            r"\b[a-z0-9]+\b",
            required_text
        )
    )

    candidate_words = set(
        re.findall(
            r"\b[a-z0-9]+\b",
            candidate_text
        )
    )

    if not required_words:
        return 100.0

    overlap = (
        required_words
        & candidate_words
    )

    score = (
        len(overlap)
        / len(required_words)
    ) * 100

    return round(
        min(score, 100),
        2
    )

def calculate_component_scores(
    match_result,
    candidate,
    jd
):
    return {
        "required_skills": round(
            calculate_required_skill_score(
                match_result
            ),
            2
        ),
        "experience": round(
            calculate_experience_score(
                match_result
            ),
            2
        ),
        "semantic_similarity": round(
            calculate_semantic_score(
                match_result
            ),
            2
        ),
        "education": round(
            calculate_education_score(
                candidate,
                jd
            ),
            2
        ),
        "preferred_skills": round(
            calculate_preferred_skill_score(
                match_result
            ),
            2
        )
    }

def calculate_final_score(
    component_scores,
    weights=None
):
    if weights is None:
        weights = DEFAULT_WEIGHTS

    weights = normalize_weights(
        weights
    )

    final_score = 0

    for component, weight in weights.items():
        score = component_scores.get(
            component,
            0
        )

        final_score += (
            score * weight / 100
        )

    return round(
        max(
            0,
            min(
                final_score,
                100
            )
        ),
        2
    )

def get_recommendation(
    score,
    thresholds=None
):
    if thresholds is None:
        thresholds = {
            "strong": 85,
            "good": 70,
            "moderate": 55
        }

    if score >= thresholds["strong"]:
        return "Strong"

    if score >= thresholds["good"]:
        return "Good"

    if score >= thresholds["moderate"]:
        return "Moderate"

    return "Low"

def generate_explanation(
    component_scores,
    match_result
):
    positives = []
    gaps = []

    if component_scores["required_skills"] >= 80:
        positives.append(
            "Strong match with required skills."
        )
    elif component_scores["required_skills"] >= 50:
        positives.append(
            "Partial match with required skills."
        )
    else:
        gaps.append(
            "Several required skills are missing."
        )

    if component_scores["experience"] >= 100:
        positives.append(
            "Candidate meets the required experience."
        )
    elif component_scores["experience"] > 0:
        gaps.append(
            "Candidate has less experience than required."
        )
    else:
        gaps.append(
            "Required experience is not demonstrated."
        )

    if component_scores["semantic_similarity"] >= 70:
        positives.append(
            "Resume content is strongly aligned with the JD."
        )
    elif component_scores["semantic_similarity"] < 50:
        gaps.append(
            "Overall resume content has limited semantic alignment with the JD."
        )

    if component_scores["education"] >= 80:
        positives.append(
            "Education matches the job requirement."
        )
    elif component_scores["education"] < 50:
        gaps.append(
            "Education match is weak or missing."
        )

    if component_scores["preferred_skills"] >= 70:
        positives.append(
            "Good coverage of preferred skills."
        )

    missing_skills = (
        match_result
        .get("required_skills", {})
        .get("missing", [])
    )

    if missing_skills:
        for item in missing_skills:
            if isinstance(item, dict):
                skill = item.get(
                    "skill",
                    ""
                )
            else:
                skill = item

            if skill:
                gaps.append(
                    f"Missing required skill: {skill}."
                )

    return {
        "positive_factors": positives,
        "skill_gaps": gaps
    }

def score_candidate(
    match_result,
    candidate,
    jd,
    weights=None,
    thresholds=None
):
    component_scores = calculate_component_scores(
        match_result,
        candidate,
        jd
    )

    final_score = calculate_final_score(
        component_scores,
        weights
    )

    recommendation = get_recommendation(
        final_score,
        thresholds
    )

    explanation = generate_explanation(
        component_scores,
        match_result
    )

    return {
        "candidate_id": match_result.get(
            "candidate_id"
        ),
        "candidate_name": match_result.get(
            "candidate_name"
        ),
        "score": final_score,
        "recommendation": recommendation,
        "component_scores": component_scores,
        "weights": normalize_weights(
            weights or DEFAULT_WEIGHTS
        ),
        "explanation": explanation
    }

if __name__ == "__main__":
    jd = {
        "education": [
            "Bachelor's degree in Computer Science"
        ]
    }

    candidate = {
        "candidate_id": "candidate_01",
        "name": "Shantanu Gorai",
        "education": [
            "Bachelor of Engineering in Computer Science"
        ]
    }

    match_result = {
        "candidate_id": "candidate_01",
        "candidate_name": "Shantanu Gorai",
        "required_skills": {
            "matched": [
                "python",
                "fastapi",
                "postgresql",
                "docker"
            ],
            "missing": [],
            "score": 100
        },
        "preferred_skills": {
            "matched": [
                "machine learning"
            ],
            "missing": [
                "aws"
            ],
            "score": 50
        },
        "semantic_similarity": 0.78,
        "experience": {
            "required_years": 3,
            "candidate_years": 3.5,
            "score": 100,
            "meets_requirement": True
        }
    }

    result = score_candidate(
        match_result,
        candidate,
        jd
    )

    import json

    print(
        json.dumps(
            result,
            indent=4,
            ensure_ascii=False
        )
    )