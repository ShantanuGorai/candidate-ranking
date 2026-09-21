import re
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

model = SentenceTransformer("all-MiniLM-L6-v2")

def clean_skill(skill):
    skill = str(skill).lower().strip()
    skill = re.sub(r"\s+", " ", skill)
    skill = skill.strip(".,;:|/-")
    return skill

def normalize_skills(skills, threshold=0.82):
    cleaned = []

    for skill in skills:
        skill = clean_skill(skill)

        if skill and skill not in cleaned:
            cleaned.append(skill)

    if len(cleaned) <= 1:
        return cleaned

    embeddings = model.encode(
        cleaned,
        normalize_embeddings=True
    )

    similarities = cosine_similarity(
        embeddings
    )

    groups = []
    used = set()

    for i in range(len(cleaned)):
        if i in used:
            continue

        group = [i]
        used.add(i)

        for j in range(i + 1, len(cleaned)):
            if j in used:
                continue

            if similarities[i][j] >= threshold:
                group.append(j)
                used.add(j)

        groups.append(group)

    normalized = []

    for group in groups:
        names = [
            cleaned[i]
            for i in group
        ]

        canonical = max(
            names,
            key=lambda x: (
                len(x.split()),
                len(x)
            )
        )

        normalized.append(canonical)

    return normalized