import fitz
import re
import json
import os
from tkinter import Tk, filedialog
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
from skill_normalizer import normalize_skills
from experience_extractor import extract_experience

def select_resumes():
    root = Tk()
    root.withdraw()

    file_paths = filedialog.askopenfilenames(
        title="Select Resumes",
        filetypes=[
            ("PDF Files", "*.pdf"),
            ("All Files", "*.*")
        ]
    )

    root.destroy()

    return list(file_paths)

model = SentenceTransformer("all-MiniLM-L6-v2")

categories = [
    "personal information",
    "skills",
    "technical skills",
    "education",
    "work experience",
    "professional experience",
    "employment history",
    "projects",
    "certifications",
    "achievements",
    "internships",
    "summary",
    "objective",
    "publications",
    "languages",
    "interests"
]

category_embeddings = model.encode(
    categories,
    normalize_embeddings=True
)

def extract_resume_text(file_path):
    doc = fitz.open(file_path)

    text = ""

    for page in doc:
        text += page.get_text()
        text += "\n"

    doc.close()

    return text

def clean_text(text):
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text)

    lines = []

    for line in text.splitlines():
        line = line.strip()

        if line:
            lines.append(line)

    return "\n".join(lines)

def classify_section(heading):
    embedding = model.encode(
        [heading],
        normalize_embeddings=True
    )

    similarities = cosine_similarity(
        embedding,
        category_embeddings
    )[0]

    index = similarities.argmax()

    return (
        categories[index],
        float(similarities[index])
    )

def is_possible_heading(line):
    line = line.strip()

    if not line:
        return False

    if re.match(r"^[-•*▪◦]", line):
        return False

    if len(line) > 60:
        return False

    if len(line.split()) > 8:
        return False

    if line.endswith("."):
        return False

    return True

def parse_resume_sections(text):
    lines = text.splitlines()

    sections = {}

    current_heading = None
    current_content = []

    for line in lines:
        line = line.strip()

        if not line:
            continue

        if is_possible_heading(line):
            section_type, similarity = classify_section(line)

            if similarity >= 0.55:
                if current_heading is not None:
                    sections[current_heading] = " ".join(
                        current_content
                    ).strip()

                current_heading = line.rstrip(":").strip()
                current_content = []

                continue

        if current_heading is not None:
            current_content.append(line)

    if current_heading is not None:
        sections[current_heading] = " ".join(
            current_content
        ).strip()

    return sections

def extract_email(text):
    pattern = (
        r"\b[A-Za-z0-9._%+-]+"
        r"@[A-Za-z0-9.-]+\."
        r"[A-Za-z]{2,}\b"
    )

    match = re.search(
        pattern,
        text
    )

    if match:
        return match.group()

    return None

def extract_phone(text):
    pattern = r"(?:\+91[\s-]?)?[6-9]\d{9}"

    match = re.search(
        pattern,
        text
    )

    if match:
        return match.group()

    return None

def extract_name(text):
    lines = [
        line.strip()
        for line in text.splitlines()
        if line.strip()
    ]

    for line in lines[:10]:
        if "@" in line:
            continue

        if re.search(r"\d{6,}", line):
            continue

        if any(
            word in line.lower()
            for word in [
                "resume",
                "curriculum vitae",
                "cv"
            ]
        ):
            continue

        words = line.split()

        if 2 <= len(words) <= 4:
            if all(
                re.match(
                    r"^[A-Za-z.\-']+$",
                    word
                )
                for word in words
            ):
                return line

    return None

def extract_skills(sections):
    skills = []

    for heading, content in sections.items():
        section_type, score = classify_section(heading)

        if (
            section_type in [
                "skills",
                "technical skills"
            ]
            and score >= 0.50
        ):
            parts = re.split(
                r"[,|•;]",
                content
            )

            for skill in parts:
                skill = skill.strip()

                if skill:
                    skills.append(skill)

    return normalize_skills(skills)

def extract_education(sections):
    education = []

    for heading, content in sections.items():
        section_type, score = classify_section(heading)

        if (
            section_type == "education"
            and score >= 0.50
        ):
            education.append(content)

    return education

def extract_experience_sections(sections):
    experience = []

    for heading, content in sections.items():
        section_type, score = classify_section(heading)

        if section_type in [
            "work experience",
            "professional experience",
            "employment history",
            "internships"
        ] and score >= 0.50:
            experience.append(content)

    return experience

def extract_certifications(sections):
    certifications = []

    for heading, content in sections.items():
        section_type, score = classify_section(heading)

        if (
            section_type == "certifications"
            and score >= 0.50
        ):
            certifications.append(content)

    return certifications

def extract_projects(sections):
    projects = []

    for heading, content in sections.items():
        section_type, score = classify_section(heading)

        if (
            section_type == "projects"
            and score >= 0.50
        ):
            projects.append(content)

    return projects

def parse_resume(file_path):
    raw_text = extract_resume_text(file_path)

    text = clean_text(raw_text)

    sections = parse_resume_sections(text)

    experience_text = " ".join(
        extract_experience_sections(sections)
    )

    resume_data = {
        "candidate_id": os.path.splitext(
            os.path.basename(file_path)
        )[0],
        "file_name": os.path.basename(file_path),
        "file_path": file_path,
        "name": extract_name(text),
        "email": extract_email(text),
        "phone": extract_phone(text),
        "skills": extract_skills(sections),
        "education": extract_education(sections),
        "experience": extract_experience(
            experience_text
        ),
        "certifications": extract_certifications(
            sections
        ),
        "projects": extract_projects(
            sections
        ),
        "sections": sections
    }

    return resume_data

def parse_multiple_resumes(file_paths):
    results = []

    for file_path in file_paths:
        try:
            result = parse_resume(file_path)
            results.append(result)

        except Exception as error:
            results.append({
                "candidate_id": os.path.splitext(
                    os.path.basename(file_path)
                )[0],
                "file_name": os.path.basename(
                    file_path
                ),
                "error": str(error)
            })

    return results

if __name__ == "__main__":
    file_paths = select_resumes()

    if not file_paths:
        print("No resumes selected.")
    else:
        results = parse_multiple_resumes(
            file_paths
        )

        print(
            json.dumps(
                results,
                indent=4,
                ensure_ascii=False
            )
        )

        with open(
            "parsed_resumes.json",
            "w",
            encoding="utf-8"
        ) as file:
            json.dump(
                results,
                file,
                indent=4,
                ensure_ascii=False
            )

        print(
            f"\n{len(results)} resume(s) parsed successfully!"
        )