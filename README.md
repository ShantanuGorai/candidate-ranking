# Candidate Ranking

An AI-powered recruiting tool that ranks candidates against a job description, explains every score in plain language, and gives recruiters the tools to act on it: a chatbot, draft emails, hiring-stage tracking, and more.

Upload a job description and a batch of resumes. Get back a ranked, explainable shortlist in seconds, no manual resume screening required.

---

## Key Features

### Smart Matching and Scoring
Parses both the JD and every resume (including messy, multi-column, or prose-style PDFs), then scores each candidate on required skills, preferred skills, experience, education, and overall JD alignment using semantic similarity, not just keyword matching.

### Explainable Results
Every score comes with a reason:
- Positive factors
- Missing skills, shown as exact chips, not vague text
- An experience gap breakdown
- Direct quotes pulled from the resume as evidence for each JD requirement

### Talent Map
A 2D visualization (via PCA) plotting every candidate's resume against the JD, clustering similar profiles so you can spot your strongest group at a glance.

### Skill Trends and Radar Chart
See which JD skills are well covered across your whole candidate pool and which are scarce, visualized as a radar chart, plus a one-click exportable report.

### Live "What-If" Scoring
Drag sliders to reweight how much required skills, experience, or education matter, and watch the ranking update in real time, no re-upload needed.

### Recruiting Assistant Chatbot
A floating chatbot that answers questions in plain language:
- "Should I shortlist Priya or Raj?"
- "He has more experience but fewer skills, should I hire him?"
- Or just type a skill name like "scikit-learn" to see how relevant it is to this specific JD

### One-Click Candidate Emails
Draft and send real interview-invite or rejection emails (with date and mode fields for interviews), personalized from each candidate's actual matched and missing skills, and automatically tracked as a hiring stage.

### Hiring Pipeline Tracking
Move candidates through New, Shortlisted, Interview Invited, Rejected, and Hired, auto-updated when an email is sent, with recruiter notes and CSV export.

### Duplicate Detection and Blind Screening
Flags likely duplicate submissions (by email, phone, or name) and offers a blind mode that hides names and contact details to reduce bias during screening.

---

## Tech Stack

### Backend
- **Language:** Python
- **Web framework:** Flask
- **Cross-origin requests:** Flask-CORS
- **PDF parsing:** PyMuPDF (fitz)
- **Email sending:** smtplib + email.mime.text (Gmail SMTP)
- **Numerical computing:** NumPy

### AI / ML
- **Embedding model:** Sentence-Transformers (all-MiniLM-L6-v2)
  Used for semantic skill matching, resume section classification, evidence retrieval, and skill-relevance chatbot queries
- **Similarity search:** scikit-learn (cosine_similarity)
  Used for matching JD requirements to resume content
- **Dimensionality reduction:** scikit-learn (PCA)
  Used for the 2D talent map visualization
- **Clustering:** scikit-learn (KMeans)
  Used for grouping similar candidate profiles on the talent map
- **Pattern extraction:** Python `re` (regex)
  Used for experience date ranges, bullet-point skill splitting, and email/phone extraction

### Frontend
- **Framework:** React (with TypeScript)
- **Build tool:** Vite
- **Styling:** Tailwind CSS
- **UI components:** shadcn/ui
- **Animation:** Framer Motion
- **Icons:** Lucide React
- **Font:** Inter (Google Fonts)

### Architecture Notes
- No database. The app is stateless; each ranking run parses the uploaded JD and resumes fresh and returns everything in one response.
- No external AI API. All matching, scoring, evidence retrieval, the chatbot, and skill-relevance lookups run on a self-hosted MiniLM model via sentence-transformers, not a third-party LLM service.
- REST API between a Vite dev server (frontend, port 5173) and Flask (backend, port 5000), communicating over fetch/JSON.

---

## Project Structure

```
candidate-ranking/
├── app.py                   # Flask API (ranking, email sending, skill relevance)
├── JD_parsing.py             # Job description PDF parsing and normalization
├── resume_parser.py          # Resume PDF parsing and section extraction
├── matcher.py                 # Semantic skill and experience matching
├── scorer.py                  # Weighted scoring and recommendation labels
├── candidate_ranking.py       # Final ranking logic
├── insights.py                 # Evidence retrieval, talent map, parse confidence
├── experience_extractor.py     # Work experience date parsing
├── skill_normalizer.py         # Skill name normalization and deduplication
├── requirements.txt
└── Upload-JD/                  # React + TypeScript frontend
    └── src/
        ├── App.tsx
        ├── components/ui/      # shadcn/ui components
        └── lib/
            ├── recruiterBot.ts   # Chatbot logic
            ├── emailDrafts.ts    # Email template generation
            └── skillTrends.ts    # Skill coverage and radar chart
```

---

## Getting Started

### Backend

```bash
pip install -r requirements.txt
python app.py
```

The first run downloads the MiniLM model, so an internet connection is required once.

To enable real email sending (interview invites and rejections), set a Gmail App Password before starting the server:

```bash
export SENDER_APP_PASSWORD="your-16-char-app-password"
python app.py
```

### Frontend

```bash
cd Upload-JD
npm install
npm run dev
```

The app runs at `http://localhost:5173` by default and expects the backend at `http://localhost:5000`.

---

## API Endpoints

### `GET /api/health`
Health check.

### `POST /api/rank`
Upload a JD and resumes, get back ranked candidates.

### `POST /api/send-email`
Send an interview-invite or rejection email.

### `POST /api/skill-relevance`
Check how relevant a given skill is to the loaded JD.

---

## Notes and Limitations

- Email sending requires a Gmail App Password (2-Step Verification must be enabled on the sending account).
- The skill-relevance chatbot checks relevance against the job description only; it does not re-scan every resume for an arbitrary skill typed on the spot.
- Resume and JD parsing quality depends on PDF layout; a "parsing confidence" indicator flags candidates whose resumes may have been harder to extract.

## 👨‍💻 Author

**Shantanu Gorai**

AI/ML Enthusiast | Full-Stack Developer

Passionate about building practical AI-powered applications that solve real-world problems through machine learning, natural language processing, and software development.

## 🤝 Contributions & Feedback

Suggestions, feedback, and ideas for improvement are welcome.

If you find this project interesting, consider giving the repository a ⭐ on GitHub.

## 📜 License

Add a suitable open-source license if you intend to distribute the project under one. Make sure the selected license reflects how you want others to use, modify, and distribute your code.

---

**AI-Assisted Screening | Explainable Candidate Ranking | Smarter Recruitment Workflows**

Built by **Shantanu Gorai**.
