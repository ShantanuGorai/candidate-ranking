# 🚀 AI-Powered Candidate Ranking & Recruitment Intelligence System

An AI-powered recruitment platform that automates bulk resume parsing, analyzes job descriptions, ranks candidates based on job-specific requirements, and provides explainable insights to support smarter, more transparent hiring decisions.

## 📌 Overview

Recruiters often receive hundreds or thousands of applications for a single job opening. Manually reviewing every resume is time-consuming, while automated screening systems can sometimes overlook qualified candidates or provide limited explanations for their decisions.

The **AI-Powered Candidate Ranking & Recruitment Intelligence System** addresses these challenges by enabling recruiters to upload a Job Description (JD) and multiple resumes simultaneously. The system extracts job requirements, analyzes candidate qualifications, calculates compatibility scores, and ranks candidates according to their suitability for the role.

Beyond candidate ranking, the platform offers explainable scoring, skill-gap analysis, blind screening, duplicate resume detection, recruitment analytics, automated email communication, and an AI Recruiting Assistant.

The goal is to make recruitment more efficient, consistent, explainable, and data-driven while keeping recruiters in control of final hiring decisions.

## ✨ Key Features

### 📄 1. Intelligent Job Description & Resume Parsing

- Upload a Job Description and multiple candidate resumes in a single workflow.
- Extract required skills, experience, educational qualifications, certifications, and other relevant criteria from the JD.
- Parse resumes to identify candidate skills, work experience, education, and qualifications.
- Compare candidate profiles against job-specific requirements.
- Identify potential qualification gaps and missing requirements.

### 🏆 2. Automated Candidate Scoring & Ranking

- Calculate a compatibility score for every candidate.
- Rank candidates according to their match with the target job description.
- Display higher-scoring candidates at the top of the ranked list.
- Sort candidates alphabetically by name when needed.
- Support configurable scoring weights for different evaluation criteria.

### 📊 3. Explainable Candidate Evaluation

Every candidate receives a detailed evaluation to help recruiters understand the reasoning behind their score.

- **Overall Match Score:** Indicates the candidate's estimated compatibility with the role.
- **Positive Factors:** Highlights relevant skills, qualifications, and experience.
- **Negative Factors:** Identifies potential mismatches or gaps.
- **Missing Required Skills:** Lists required skills that were not identified in the resume.
- **Score Breakdown:** Shows the contribution of individual evaluation factors to the overall score.

This feature helps recruiters move beyond a single numerical score and review the factors influencing candidate rankings.

### ⭐ 4. Talent Map Visualization

The Talent Map provides a visual representation of candidate-job compatibility.

- Visualize candidates based on their match with the job description.
- Identify stronger and weaker matches at a glance.
- Use proximity to the star as an indication of a closer match to the job requirements.

### ⚖️ 5. Blind Screening Mode

Blind Screening helps recruiters focus on candidate qualifications during the initial evaluation stage.

- Replace candidate names with anonymized labels such as Candidate 1, Candidate 2, and Candidate 3.
- Reduce exposure to identifiable information during initial screening.
- Support a more structured and qualification-focused review process.

Blind screening is intended to help reduce certain sources of bias; it does not guarantee bias-free recruitment.

### 🎛️ 6. What-If Scoring Weights

Different roles require different evaluation priorities. The What-If Scoring Weights feature allows recruiters to experiment with these priorities.

- Adjust the importance of individual scoring factors.
- Automatically recalculate candidate scores when weights change.
- Observe how changing evaluation priorities affects candidate rankings.
- Customize the evaluation approach for different job requirements.

### 📧 7. Automated Candidate Email Communication

Streamline candidate communication with interview invitations and professional rejection emails.

**Interview Invitations**
- Select shortlisted candidates.
- Specify the interview date and mode.
- Generate interview emails using contact information extracted from resumes.
- Review and edit email content before sending.

**Rejection Emails**
- Generate professional rejection messages for rejected candidates.
- Simplify communication throughout the recruitment process.

This feature reduces repetitive administrative work and helps recruiters communicate more efficiently with applicants.

### 📈 8. Skill Trend Analysis & Recruitment Analytics

Understand the distribution of job-related skills across the applicant pool.

- Analyze how frequently each JD skill appears in the uploaded resumes.
- Identify commonly available skills and less frequently represented requirements.
- Visualize skill distributions using a spider/radar chart.
- Generate downloadable reports for further analysis.

This helps recruiters understand the skill composition of the applicant pool and identify potential talent shortages.

### ♻️ 9. Duplicate Resume Detection

- Flag potential duplicate resumes within an uploaded batch.
- Help recruiters identify repeated candidate submissions.
- Reduce redundant resume reviews.
- Improve the organization of candidate records.

Duplicate detection should be treated as a flag for review rather than definitive proof that two submissions belong to the same person.

### 🤖 10. AI Recruiting Assistant

The AI Recruiting Assistant helps recruiters explore candidate suitability and skill relevance through conversational queries.

**Candidate Suitability Analysis**
- Enter a candidate's name to request an evaluation for the target role.
- Identify relevant qualifications, skills, and experience.
- Highlight positive factors supporting the candidate's suitability.
- Explain potential mismatches and missing requirements.

**Skill Relevance Analysis**
- Query skills such as `Python`, `scikit-learn`, or `Computer Vision`.
- Understand how a skill relates to the target job.
- Check whether the skill is explicitly mentioned in the JD.
- Get contextual insights to support recruiter decisions.

The assistant is designed to support recruiter analysis, not replace independent candidate review.

### 📥 11. Flexible Candidate Export

Export candidate information according to recruitment needs.

- Export all candidates.
- Export shortlisted candidates.
- Export rejected candidates.

This supports reporting, record-keeping, and downstream recruitment workflows.

## 🔄 How It Works

1. **Upload Job Description:** The recruiter provides the job description containing the role's requirements.
2. **Upload Resumes:** Multiple candidate resumes are uploaded in a single batch.
3. **Extract Information:** The system parses the JD and resumes into structured information.
4. **Match Candidates:** Candidate qualifications are compared with the job requirements.
5. **Calculate Scores:** The scoring engine evaluates candidates using the configured criteria.
6. **Rank Candidates:** Candidates are organized according to their compatibility scores.
7. **Review Insights:** Recruiters explore score breakdowns, positive and negative factors, missing skills, and visualizations.
8. **Use Screening Tools:** Recruiters can enable blind screening, review potential duplicates, and adjust scoring weights.
9. **Communicate Decisions:** Interview invitations and rejection emails can be prepared, reviewed, and sent.
10. **Export Results:** Candidate lists and skill analysis reports can be downloaded as needed.

## 🎯 Problem Statement

Traditional recruitment workflows face several challenges:

- Large volumes of applications make manual resume screening inefficient.
- Candidate qualifications can be difficult to compare consistently.
- Automated screening may provide scores without sufficient explanations.
- Recruiters may struggle to identify missing skills and qualification gaps.
- Manual interview coordination and rejection communication require additional effort.
- Identifiable information may influence initial screening decisions.
- Duplicate applications can create redundant work.
- Recruiters need better visibility into the skills available across an applicant pool.

This project addresses these challenges through a unified recruitment intelligence platform combining AI-assisted candidate evaluation, explainable scoring, visualization, and workflow automation.

## 💡 Project Objectives

- Automate bulk resume parsing and JD analysis.
- Evaluate candidate suitability against job-specific requirements.
- Generate interpretable candidate scores and rankings.
- Identify strengths, potential weaknesses, and missing required skills.
- Allow recruiters to experiment with scoring priorities.
- Support blind screening and potential duplicate detection.
- Visualize skill trends across candidate batches.
- Simplify interview and rejection communication.
- Enable flexible candidate and report exports.
- Keep human judgment central to final hiring decisions.

## 🛠️ Technology Stack

Update this section with the exact technologies used in your implementation.

- **Programming Language:** Add the language used for parsing and scoring.
- **AI/ML & NLP:** Resume parsing, skill extraction, candidate matching, and scoring.
- **Frontend:** Add your frontend framework and UI libraries.
- **Backend:** Add your backend framework and API technologies.
- **Database:** Add your database technology.
- **Visualization:** Add the charting libraries used for the Talent Map and radar chart.
- **Email Integration:** Add the email delivery service or SMTP provider.
- **Reporting:** Add the libraries used to generate downloadable reports.

## 📊 Example Candidate Evaluation

The following is an illustrative example of the information presented by the system.

| Evaluation Factor | Example Result |
|---|---|
| Overall Match Score | 87/100 |
| Relevant Skills | Python, Machine Learning, SQL |
| Positive Factors | Relevant projects and matching technical skills |
| Potential Gaps | Limited evidence of production deployment |
| Missing Required Skills | A required skill not identified in the resume |
| Recommendation | Review for potential shortlisting |

*Illustrative data only. Actual scores, factors, and recommendations depend on the job description, candidate resume, and scoring configuration.*

## ⚖️ Responsible & Explainable Recruitment

Recruitment decisions can significantly affect people's careers. This system is designed to assist human decision-making rather than make unquestionable hiring decisions.

Important considerations include:

- Use job-relevant and consistently applied evaluation criteria.
- Validate resume parsing across different document formats.
- Review candidate score explanations before making decisions.
- Treat missing information as potentially unreported information, not automatic proof of lacking a skill.
- Test scoring behavior across different candidate groups and resume formats.
- Protect candidate information and restrict unauthorized access.
- Review generated emails before sending when appropriate.
- Keep recruiters responsible for final shortlisting and hiring decisions.

A compatibility score is a decision-support signal, not a definitive measure of a candidate's potential or professional ability.

## 🔮 Future Enhancements

Potential future improvements include:

- Semantic resume-to-JD matching using transformer-based language models.
- Improved extraction of employment duration and overlapping experience.
- More robust skill normalization and synonym detection.
- Enhanced duplicate detection across differently formatted resumes.
- Resume parsing and scoring accuracy evaluation.
- Recruitment dashboards with historical analytics.
- Audit logs for scoring changes and recruiter actions.
- Expanded fairness testing and bias evaluation.
- Integration with Applicant Tracking Systems (ATS).
- Optimized processing for very large resume batches.

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
