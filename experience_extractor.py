import re
from datetime import datetime
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

model = SentenceTransformer("all-MiniLM-L6-v2")

MONTHS = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12
}

DATE_VALUE = (
    r"(?:"
    r"\d{1,2}/\d{4}"
    r"|"
    r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|"
    r"apr(?:il)?|may|jun(?:e)?|jul(?:y)?|"
    r"aug(?:ust)?|sep(?:t(?:ember)?)?|"
    r"oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
    r"\s+\d{4}"
    r"|"
    r"\d{4}"
    r"|present|current|now"
    r")"
)

DATE_PATTERN = (
    r"("
    + DATE_VALUE +
    r")\s*[-–—]\s*("
    + DATE_VALUE +
    r")"
)

def clean_text(text):
    text = re.sub(r"\s+", " ", str(text))
    return text.strip()

def parse_date(value):
    value = value.strip().lower()
    value = re.sub(r"[.,]", "", value)

    if value in [
        "present",
        "current",
        "now"
    ]:
        return datetime.now()

    match = re.fullmatch(
        r"(\d{1,2})/(\d{4})",
        value
    )

    if match:
        return datetime(
            int(match.group(2)),
            int(match.group(1)),
            1
        )

    for month, number in MONTHS.items():
        match = re.search(
            rf"\b{month}\s+(\d{{4}})\b",
            value
        )

        if match:
            return datetime(
                int(match.group(1)),
                number,
                1
            )

    match = re.search(
        r"\b(\d{4})\b",
        value
    )

    if match:
        return datetime(
            int(match.group(1)),
            1,
            1
        )

    return None

def calculate_months(start_date, end_date):
    return max(
        0,
        (
            (end_date.year - start_date.year) * 12
            + end_date.month
            - start_date.month
        )
    )

def extract_explicit_years(text):
    patterns = [
        r"(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?experience",
        r"experience\s*[:\-]?\s*(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)",
        r"minimum\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*(?:years?|yrs?)"
    ]

    values = []

    for pattern in patterns:
        matches = re.findall(
            pattern,
            text,
            re.IGNORECASE
        )

        for match in matches:
            values.append(float(match))

    return max(values) if values else None

def extract_date_ranges(text):
    matches = re.findall(
        DATE_PATTERN,
        text,
        re.IGNORECASE
    )

    ranges = []

    for start, end in matches:
        start_date = parse_date(start)
        end_date = parse_date(end)

        if not start_date or not end_date:
            continue

        if end_date < start_date:
            continue

        ranges.append({
            "start": start,
            "end": end,
            "start_date": start_date,
            "end_date": end_date,
            "months": calculate_months(
                start_date,
                end_date
            )
        })

    return ranges

def merge_overlapping_ranges(ranges):
    if not ranges:
        return []

    ranges = sorted(
        ranges,
        key=lambda x: x["start_date"]
    )

    merged = []

    current_start = ranges[0]["start_date"]
    current_end = ranges[0]["end_date"]

    for item in ranges[1:]:
        if item["start_date"] <= current_end:
            current_end = max(
                current_end,
                item["end_date"]
            )
        else:
            merged.append({
                "start_date": current_start,
                "end_date": current_end,
                "months": calculate_months(
                    current_start,
                    current_end
                )
            })

            current_start = item["start_date"]
            current_end = item["end_date"]

    merged.append({
        "start_date": current_start,
        "end_date": current_end,
        "months": calculate_months(
            current_start,
            current_end
        )
    })

    return merged

def split_experience_blocks(text):
    lines = [
        line.strip()
        for line in text.splitlines()
        if line.strip()
    ]

    blocks = []
    current = []

    for line in lines:
        if re.search(
            DATE_PATTERN,
            line,
            re.IGNORECASE
        ):
            if current:
                blocks.append(current)

            current = [line]
        else:
            current.append(line)

    if current:
        blocks.append(current)

    return blocks

def extract_role(block):
    patterns = [
        r"(?:role|position|title)\s*[:\-]\s*(.+)",
        r"(?:worked as|working as|joined as)\s+(.+)"
    ]

    text = "\n".join(block)

    for pattern in patterns:
        match = re.search(
            pattern,
            text,
            re.IGNORECASE
        )

        if match:
            return clean_text(
                match.group(1)
            )

    for line in block:
        if re.search(
            DATE_PATTERN,
            line,
            re.IGNORECASE
        ):
            continue

        if len(line.split()) <= 8:
            if not re.search(
                r"@|https?://|\d{6,}",
                line
            ):
                return clean_text(line)

    return None

def extract_company(block, role):
    for line in block:
        line = clean_text(line)

        if re.search(
            DATE_PATTERN,
            line,
            re.IGNORECASE
        ):
            continue

        if role and line.lower() == role.lower():
            continue

        if len(line.split()) <= 8:
            return line

    return None

def extract_skills_from_block(
    block,
    skill_vocabulary
):
    if not skill_vocabulary:
        return []

    text = " ".join(block).lower()

    found = []

    for skill in skill_vocabulary:
        skill = clean_text(skill)

        if not skill:
            continue

        pattern = (
            r"(?<!\w)"
            + re.escape(skill.lower())
            + r"(?!\w)"
        )

        if re.search(
            pattern,
            text
        ):
            found.append(skill)

    return found

def extract_domain(
    block,
    domain_vocabulary,
    threshold=0.45
):
    if not domain_vocabulary:
        return None

    text = clean_text(
        " ".join(block)
    )

    embeddings = model.encode(
        [text] + domain_vocabulary,
        normalize_embeddings=True
    )

    similarities = cosine_similarity(
        [embeddings[0]],
        embeddings[1:]
    )[0]

    index = similarities.argmax()
    score = float(similarities[index])

    if score < threshold:
        return None

    return {
        "domain": domain_vocabulary[index],
        "similarity": round(
            score,
            4
        )
    }

def parse_experience_block(
    block,
    skill_vocabulary=None,
    domain_vocabulary=None
):
    text = "\n".join(block)

    ranges = extract_date_ranges(text)

    role = extract_role(block)

    company = extract_company(
        block,
        role
    )

    if ranges:
        date_range = ranges[0]

        start = date_range["start"]
        end = date_range["end"]
        months = date_range["months"]
    else:
        start = None
        end = None
        months = 0

    skills = extract_skills_from_block(
        block,
        skill_vocabulary
    )

    domain = extract_domain(
        block,
        domain_vocabulary
    )

    return {
        "role": role,
        "company": company,
        "start": start,
        "end": end,
        "months": months,
        "years": round(
            months / 12,
            2
        ),
        "skills": skills,
        "domain": domain,
        "description": clean_text(text)
    }

def calculate_relevant_experience(
    experiences,
    jd_text,
    threshold=0.40
):
    if not experiences:
        return {
            "relevant_months": 0,
            "relevant_years": 0,
            "matched_experiences": []
        }

    jd_embedding = model.encode(
        [jd_text],
        normalize_embeddings=True
    )

    matched = []
    relevant_months = 0

    for experience in experiences:
        experience_text = " ".join([
            experience.get("role") or "",
            experience.get("description") or "",
            " ".join(
                experience.get("skills") or []
            )
        ])

        embedding = model.encode(
            [experience_text],
            normalize_embeddings=True
        )

        similarity = float(
            cosine_similarity(
                jd_embedding,
                embedding
            )[0][0]
        )

        if similarity >= threshold:
            relevant_months += experience[
                "months"
            ]

            matched.append({
                "role": experience["role"],
                "company": experience["company"],
                "months": experience["months"],
                "similarity": round(
                    similarity,
                    4
                )
            })

    return {
        "relevant_months": relevant_months,
        "relevant_years": round(
            relevant_months / 12,
            2
        ),
        "matched_experiences": matched
    }

def extract_experience(
    text,
    skill_vocabulary=None,
    domain_vocabulary=None
):
    explicit_years = extract_explicit_years(
        text
    )

    date_ranges = extract_date_ranges(
        text
    )

    merged_ranges = merge_overlapping_ranges(
        date_ranges
    )

    total_months = sum(
        item["months"]
        for item in merged_ranges
    )

    date_based_years = round(
        total_months / 12,
        2
    )

    if explicit_years is not None:
        estimated_years = max(
            explicit_years,
            date_based_years
        )
    else:
        estimated_years = date_based_years

    blocks = split_experience_blocks(
        text
    )

    experiences = []

    for block in blocks:
        experience = parse_experience_block(
            block,
            skill_vocabulary,
            domain_vocabulary
        )

        if (
            experience["role"]
            or experience["start"]
        ):
            experiences.append(
                experience
            )

    return {
        "estimated_years": estimated_years,
        "explicit_years": explicit_years,
        "date_based_years": date_based_years,
        "total_months": total_months,
        "experiences": experiences
    }