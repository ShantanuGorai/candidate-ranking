import fitz
import re
import json
from collections import Counter
from tkinter import Tk, filedialog
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

def select_jd():
    root = Tk()
    root.withdraw()
    file_path = filedialog.askopenfilename(
        title="Select Job Description",
        filetypes=[
            ("PDF Files", "*.pdf"),
            ("All Files", "*.*")
        ]
    )
    root.destroy()
    return file_path

model = SentenceTransformer("all-MiniLM-L6-v2")

categories = [
    "job title",
    "job description",
    "responsibilities",
    "required skills",
    "preferred skills",
    "qualifications",
    "education",
    "experience",
    "certifications",
    "requirements",
    "preferred qualifications",
    "company information",
    "industry",
    "domain"
]

category_embeddings = model.encode(
    categories,
    normalize_embeddings=True
)

def clean_text(text):
    text = re.sub(r"\s+", " ", text)
    return text.strip()

def extract_pdf_layout(file_path):
    doc = fitz.open(file_path)
    lines = []

    for page_number, page in enumerate(doc, start=1):
        page_dict = page.get_text("dict")

        for block in page_dict["blocks"]:
            if "lines" not in block:
                continue

            for line in block["lines"]:
                spans = line["spans"]

                if not spans:
                    continue

                text_parts = [
                    span["text"].strip()
                    for span in spans
                    if span["text"].strip()
                ]

                text = clean_text(" ".join(text_parts))

                if not text:
                    continue

                sizes = [
                    span["size"]
                    for span in spans
                    if span["text"].strip()
                ]

                font_size = max(sizes) if sizes else 0

                bold = any(
                    "bold" in span.get("font", "").lower()
                    for span in spans
                )

                x0, y0, x1, y1 = line["bbox"]

                lines.append({
                    "text": text,
                    "font_size": font_size,
                    "bold": bold,
                    "x0": x0,
                    "y0": y0,
                    "x1": x1,
                    "y1": y1,
                    "page": page_number
                })

    doc.close()
    return lines

def get_body_font_size(lines):
    sizes = [
        round(line["font_size"], 1)
        for line in lines
        if line["font_size"] > 0
    ]

    if not sizes:
        return 11

    return Counter(sizes).most_common(1)[0][0]

def classify_heading(text):
    embedding = model.encode(
        [text],
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

def is_heading_candidate(line, body_font_size):
    text = clean_text(line["text"])

    if not text:
        return False

    if re.match(r"^[-•*▪◦]", text):
        return False

    if len(text) > 60:
        return False

    if len(text.split()) > 10:
        return False

    if text.endswith("."):
        return False

    larger_font = (
        line["font_size"] >= body_font_size * 1.15
    )

    bold = line["bold"]

    colon_heading = (
        text.endswith(":")
        and len(text.split()) <= 8
    )

    uppercase = (
        text.isupper()
        and len(text.split()) <= 8
    )

    return (
        larger_font
        or bold
        or colon_heading
        or uppercase
    )

def merge_multiline_headings(lines, body_font_size):
    merged = []
    i = 0

    while i < len(lines):
        current = lines[i]

        if not is_heading_candidate(
            current,
            body_font_size
        ):
            merged.append(current)
            i += 1
            continue

        text = current["text"]

        j = i + 1

        while j < len(lines):
            next_line = lines[j]

            if next_line["page"] != current["page"]:
                break

            vertical_gap = (
                next_line["y0"] - current["y1"]
            )

            similar_font = abs(
                next_line["font_size"]
                - current["font_size"]
            ) <= 1.5

            similar_style = (
                next_line["bold"] == current["bold"]
            )

            if (
                vertical_gap <= current["font_size"] * 0.8
                and similar_font
                and similar_style
                and len(text.split()) < 10
            ):
                combined = clean_text(
                    text + " " + next_line["text"]
                )

                if len(combined) <= 60:
                    text = combined
                    current["y1"] = next_line["y1"]
                    j += 1
                    continue

            break

        current["text"] = text
        merged.append(current)
        i = j

    return merged

def parse_jd(file_path):
    lines = extract_pdf_layout(file_path)

    if not lines:
        return {}

    body_font_size = get_body_font_size(lines)

    lines = merge_multiline_headings(
        lines,
        body_font_size
    )

    jd_data = {}

    current_heading = None
    current_content = []

    for line in lines:
        text = clean_text(line["text"])

        if is_heading_candidate(
            line,
            body_font_size
        ):
            section_type, similarity = classify_heading(text)

            if similarity >= 0.50:
                if current_heading is not None:
                    jd_data[current_heading] = clean_text(
                        " ".join(current_content)
                    )

                current_heading = text.rstrip(":").strip()
                current_content = []
                continue

        if current_heading is not None:
            current_content.append(text)

    if current_heading is not None:
        jd_data[current_heading] = clean_text(
            " ".join(current_content)
        )

    return jd_data

if __name__ == "__main__":
    file_path = select_jd()

    if not file_path:
        print("No job description selected.")
    else:
        result = parse_jd(file_path)

        print(
            json.dumps(
                result,
                indent=4,
                ensure_ascii=False
            )
        )

        with open(
            "parsed_jd.json",
            "w",
            encoding="utf-8"
        ) as file:
            json.dump(
                result,
                file,
                indent=4,
                ensure_ascii=False
            )

        print("\nJob description parsed successfully!")