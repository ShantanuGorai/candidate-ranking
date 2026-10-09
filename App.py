import os
import re
import shutil
import smtplib
import tempfile
import traceback
from email.mime.text import MIMEText

import numpy as np

from flask import Flask, jsonify, request
from flask_cors import CORS

from JD_parsing import parse_jd
from resume_parser import parse_multiple_resumes
from matcher import match_candidate, model as embedding_model
from insights import (
    analyze_candidate,
    build_talent_map,
    near_misses,
    parse_confidence,
)
from scorer import score_candidate
from candidate_ranking import rank_candidates

app = Flask(__name__)
# Allow the Vite dev server (default port 5173) to call this API.
CORS(app, resources={r"/api/*": {"origins": "*"}})

ALLOWED_EXTENSIONS = {"pdf"}

# Sender address for outgoing candidate emails. Hardcoded for now per your
# request; override with the SENDER_EMAIL env var later (e.g. once you want
# to send from a dedicated recruiting inbox instead of your personal one).
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "shantanugorai013@gmail.com")
SENDER_APP_PASSWORD = os.environ.get("SENDER_APP_PASSWORD")
SENDER_DISPLAY_NAME = os.environ.get("SENDER_DISPLAY_NAME", "webmobi 360 Recruitment Team")

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def encode(texts):
    """Encode with the same MiniLM model matcher.py already loaded."""
    return embedding_model.encode(texts, normalize_embeddings=True)


def allowed_file(filename):
    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS
    )


def extract_skill_names(missing_items):
    """Normalize a `missing` skills list (from matcher.py) into plain names.

    Each item is either a plain string (when the candidate had no skills at
    all) or a dict shaped like {"skill": ..., "best_candidate_match": ...,
    "similarity": ...} (from semantic_skill_match).
    """
    names = []
    for item in missing_items or []:
        if isinstance(item, dict):
            skill = item.get("skill") or item.get("required_skill")
        else:
            skill = item
        if skill:
            names.append(skill)
    return names


def generate_interview_questions(missing_required, matched_required):
    """Deterministic, template-based interview prompts built from the
    candidate's skill gaps and strengths (no external API needed)."""
    questions = []

    for skill in missing_required[:3]:
        questions.append(
            f'The role calls for "{skill}". What related experience '
            f"do you have, and how quickly could you ramp up?"
        )

    for skill in matched_required[:2]:
        questions.append(
            f'Walk us through a concrete example where you applied "{skill}" '
            f"and what the outcome was."
        )

    if not questions:
        questions.append(
            "Tell us about the achievement you are most proud of that is "
            "relevant to this role."
        )

    return questions


def normalize_phone(phone):
    return "".join(ch for ch in str(phone or "") if ch.isdigit())[-10:]


def flag_duplicates(results):
    """Mark candidates that look like the same person (same email, same
    phone number, or same name) as an earlier upload."""
    seen = {}

    for item in results:
        contact = item.get("contact", {})
        keys = []

        email = (contact.get("email") or "").strip().lower()
        if email:
            keys.append(("email", email))

        phone = normalize_phone(contact.get("phone"))
        if len(phone) >= 7:
            keys.append(("phone", phone))

        name = (item.get("candidate_name") or "").strip().lower()
        if name:
            keys.append(("name", name))

        original = None
        for key in keys:
            if key in seen:
                original = seen[key]
                break

        if original is not None:
            item["duplicate_of"] = original
        else:
            for key in keys:
                seen[key] = item.get("candidate_name") or item.get(
                    "candidate_id"
                )


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/api/send-email", methods=["POST"])
def send_email():
    data = request.get_json(silent=True) or {}

    to = (data.get("to") or "").strip()
    subject = (data.get("subject") or "").strip()
    body = data.get("body") or ""

    if not to or not EMAIL_RE.match(to):
        return jsonify({"error": "A valid recipient email address is required."}), 400

    if not subject:
        return jsonify({"error": "Subject is required."}), 400

    if not body.strip():
        return jsonify({"error": "Email body is required."}), 400

    if not SENDER_APP_PASSWORD:
        return jsonify({
            "error": (
                "Email sending isn't configured yet. Set the SENDER_APP_PASSWORD "
                "environment variable to a Gmail App Password (not your normal "
                "Gmail password — generate one at "
                "https://myaccount.google.com/apppasswords, which requires "
                "2-Step Verification to be turned on for "
                f"{SENDER_EMAIL}) and restart the server."
            )
        }), 500

    message = MIMEText(body)
    message["Subject"] = subject
    message["From"] = f"{SENDER_DISPLAY_NAME} <{SENDER_EMAIL}>"
    message["To"] = to

    try:
        with smtplib.SMTP("smtp.gmail.com", 587, timeout=15) as server:
            server.starttls()
            server.login(SENDER_EMAIL, SENDER_APP_PASSWORD)
            server.sendmail(SENDER_EMAIL, [to], message.as_string())
    except smtplib.SMTPAuthenticationError:
        return jsonify({
            "error": (
                "Gmail rejected the login. Double-check SENDER_EMAIL and "
                "SENDER_APP_PASSWORD — it must be an App Password, not your "
                "regular Gmail password."
            )
        }), 502
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        return jsonify({"error": f"Failed to send email: {exc}"}), 502

    return jsonify({"status": "sent", "to": to})


# Similarity bars for /api/skill-relevance. Same magnitude as the
# thresholds already used elsewhere (insights.py's EVIDENCE_MIN_SIMILARITY
# = 0.35, NEAR_MISS_MIN_SIMILARITY = 0.50) for consistency.
SKILL_RELEVANCE_REQUIRED_THRESHOLD = 0.55
SKILL_RELEVANCE_PREFERRED_THRESHOLD = 0.50
SKILL_RELEVANCE_RELATED_THRESHOLD = 0.35


def _best_match(skill_vector, candidates):
    """skill_vector: 1D array. candidates: list[str]. Returns
    (best_text, best_similarity) or (None, 0.0) if candidates is empty."""
    if not candidates:
        return None, 0.0

    vectors = np.asarray(encode(candidates))
    similarities = vectors @ skill_vector
    idx = int(np.argmax(similarities))
    return candidates[idx], float(similarities[idx])


@app.route("/api/skill-relevance", methods=["POST"])
def skill_relevance():
    data = request.get_json(silent=True) or {}

    skill = (data.get("skill") or "").strip()
    required = [s for s in (data.get("required_skills") or []) if isinstance(s, str) and s.strip()]
    preferred = [s for s in (data.get("preferred_skills") or []) if isinstance(s, str) and s.strip()]
    description = (data.get("description") or "").strip()

    if not skill:
        return jsonify({"error": "A skill or phrase is required."}), 400

    if not required and not preferred and not description:
        return jsonify({
            "skill": skill,
            "category": "Insufficient data",
            "necessity": (
                "There isn't enough job description detail loaded to assess this "
                "confidently — the JD's required/preferred skills and description "
                "all came back empty."
            ),
            "closest_match": None,
            "confidence": 0.0,
        })

    try:
        skill_vector = np.asarray(encode([skill]))[0]
        best_required, required_similarity = _best_match(skill_vector, required)
        best_preferred, preferred_similarity = _best_match(skill_vector, preferred)

        description_similarity = 0.0
        if description:
            desc_vector = np.asarray(encode([description[:3000]]))[0]
            description_similarity = float(desc_vector @ skill_vector)
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        return jsonify({"error": f"Could not analyze this skill: {exc}"}), 502

    if required_similarity >= SKILL_RELEVANCE_REQUIRED_THRESHOLD:
        category = "Required"
        necessity = "Essential — this closely matches a required skill in the JD."
        closest_match = best_required
        confidence = required_similarity
    elif preferred_similarity >= SKILL_RELEVANCE_PREFERRED_THRESHOLD:
        category = "Preferred"
        necessity = "Nice-to-have — this closely matches a preferred (not required) skill in the JD."
        closest_match = best_preferred
        confidence = preferred_similarity
    elif max(required_similarity, preferred_similarity, description_similarity) >= SKILL_RELEVANCE_RELATED_THRESHOLD:
        category = "Related, not explicitly listed"
        necessity = (
            "Tangentially relevant based on the overall job description, but not "
            "explicitly called out as a required or preferred skill."
        )
        closest_match = best_required if required_similarity >= preferred_similarity else best_preferred
        confidence = max(required_similarity, preferred_similarity, description_similarity)
    else:
        category = "Not clearly relevant"
        necessity = (
            "Doesn't look closely related to this JD's required skills, preferred "
            "skills, or overall description."
        )
        closest_match = None
        confidence = max(required_similarity, preferred_similarity, description_similarity)

    return jsonify({
        "skill": skill,
        "category": category,
        "necessity": necessity,
        "closest_match": closest_match,
        "confidence": round(confidence, 3),
        "required_similarity": round(required_similarity, 3),
        "preferred_similarity": round(preferred_similarity, 3),
        "description_similarity": round(description_similarity, 3),
    })


@app.route("/api/rank", methods=["POST"])
def rank():
    jd_file = request.files.get("jd")
    resume_files = request.files.getlist("resumes")

    if not jd_file or jd_file.filename == "":
        return jsonify({"error": "No job description file uploaded."}), 400

    if not resume_files:
        return jsonify({"error": "No resume files uploaded."}), 400

    if not allowed_file(jd_file.filename):
        return jsonify({"error": "Job description must be a PDF file."}), 400

    for f in resume_files:
        if not allowed_file(f.filename):
            return jsonify(
                {"error": f"'{f.filename}' is not a PDF file."}
            ), 400

    temp_dir = tempfile.mkdtemp(prefix="candidate_ranking_")

    try:
        jd_path = os.path.join(temp_dir, jd_file.filename)
        jd_file.save(jd_path)

        resume_paths = []
        for f in resume_files:
            resume_path = os.path.join(temp_dir, f.filename)
            f.save(resume_path)
            resume_paths.append(resume_path)

        jd = parse_jd(jd_path)

        if not jd:
            return jsonify(
                {"error": "Could not parse the job description PDF."}
            ), 400

        candidates = parse_multiple_resumes(resume_paths)

        requirement_texts = [
            skill
            for skill in (jd.get("required_skills") or [])
            if isinstance(skill, str) and skill.strip()
        ][:10]

        try:
            requirement_embeddings = (
                encode(requirement_texts) if requirement_texts else None
            )
        except Exception:  # noqa: BLE001
            traceback.print_exc()
            requirement_embeddings = None

        profiles = []
        results = []
        for candidate in candidates:
            if "error" in candidate:
                results.append(candidate)
                continue

            match_result = match_candidate(jd, candidate)
            score_result = score_candidate(match_result, candidate, jd)

            score_result["missing_required_skills"] = extract_skill_names(
                match_result.get("required_skills", {}).get("missing", [])
            )
            score_result["missing_preferred_skills"] = extract_skill_names(
                match_result.get("preferred_skills", {}).get("missing", [])
            )
            score_result["experience_details"] = {
                "required_years": match_result.get("experience", {}).get(
                    "required_years"
                ),
                "candidate_years": match_result.get("experience", {}).get(
                    "candidate_years"
                ),
            }

            # Diagnostic snapshot of what was actually extracted from this
            # resume, so it's possible to tell "the model scored it low"
            # apart from "the parser extracted nothing useful from the PDF".
            score_result["debug_extracted"] = {
                "detected_skills": candidate.get("skills", []),
                "detected_sections": list(candidate.get("sections", {}).keys()),
                "detected_education": candidate.get("education", []),
                "detected_experience_years": candidate.get("experience", {}).get(
                    "estimated_years"
                ),
            }

            score_result["matched_required_skills"] = extract_skill_names(
                match_result.get("required_skills", {}).get("matched", [])
            )
            score_result["matched_preferred_skills"] = extract_skill_names(
                match_result.get("preferred_skills", {}).get("matched", [])
            )
            score_result["contact"] = {
                "email": candidate.get("email"),
                "phone": candidate.get("phone"),
            }
            score_result["interview_questions"] = generate_interview_questions(
                score_result["missing_required_skills"],
                score_result["matched_required_skills"],
            )

            try:
                full_evidence, profile = analyze_candidate(
                    encode,
                    requirement_texts,
                    requirement_embeddings,
                    candidate,
                )
            except Exception:  # noqa: BLE001
                traceback.print_exc()
                full_evidence, profile = [], None

            # Short list for display in the candidate's own panel...
            score_result["evidence"] = full_evidence[:3]
            # ...but the FULL list (every requirement that cleared the
            # similarity bar, not just the best 3) is what the skill-trends
            # panel needs to know which requirements this candidate
            # actually covers at all -- especially important for JDs that
            # write requirements as long prose sentences rather than short
            # skill keywords, where the strict exact-skill matcher used
            # elsewhere always comes back empty.
            score_result["requirement_coverage"] = [
                item["requirement"] for item in full_evidence
            ]

            score_result["near_misses"] = near_misses(
                match_result.get("required_skills", {}).get("missing", [])
            )
            score_result["parse_confidence"] = parse_confidence(candidate)

            profiles.append({
                "candidate_id": score_result.get("candidate_id"),
                "embedding": profile,
            })

            results.append(score_result)

        flag_duplicates(results)

        try:
            talent_map = build_talent_map(
                encode, jd.get("description", ""), profiles
            )
        except Exception:  # noqa: BLE001
            traceback.print_exc()
            talent_map = None

        ranked_results = rank_candidates(results)

        return jsonify(
            {
                "jd": jd,
                "results": results,
                "ranked_candidates": ranked_results,
                "talent_map": talent_map,
            }
        )

    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        return jsonify({"error": str(exc)}), 500

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)