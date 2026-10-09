// Deterministic, template-based email drafts. No external API — built
// from the same JD/candidate data already shown on the page.

export interface DraftCandidate {
  candidate_name?: string;
  matched_required_skills?: string[];
  missing_required_skills?: string[];
}

export interface DraftJobInfo {
  roleTitle?: string | null;
  company?: string | null;
}

export const SENDER_TEAM_NAME = "webmobi 360 Recruitment Team";

const greetingName = (name?: string) => (name ?? "there").trim().split(" ")[0]?.toUpperCase() || "THERE";

const roleOf = (jd?: DraftJobInfo) => jd?.roleTitle?.trim() || "the role";
const companyOf = (jd?: DraftJobInfo) => jd?.company?.trim();

const atCompany = (jd?: DraftJobInfo) => {
  const company = companyOf(jd);
  return company ? ` at ${company}` : "";
};

export interface InterviewDetails {
  date: string; // however the recruiter typed/picked it, shown as-is
  mode: string; // e.g. "Video call", "Phone call", "In-person"
}

export function interviewEmailSubject(jd?: DraftJobInfo): string {
  return `Interview invitation — ${roleOf(jd)}`;
}

export function draftInterviewEmail(
  candidate: DraftCandidate,
  details: InterviewDetails,
  jd?: DraftJobInfo
): string {
  const name = greetingName(candidate.candidate_name);
  const role = roleOf(jd);
  const company = atCompany(jd);
  const date = details.date.trim() || "[date to be confirmed]";
  const mode = details.mode.trim() || "[mode to be confirmed]";

  return (
    `Hi ${name},\n\n` +
    `Thanks for your interest in the role of ${role}${company}. We were impressed with your profile ` +
    `and would like to invite you for an interview.\n\n` +
    `Date: ${date}\n` +
    `Mode: ${mode}\n\n` +
    `Please let us know if this works for you, or if you'd like to propose an alternate time. We look ` +
    `forward to speaking with you.\n\n` +
    `Best regards,\n${SENDER_TEAM_NAME}`
  );
}

export function rejectionEmailSubject(jd?: DraftJobInfo): string {
  return `Update on your application — ${roleOf(jd)}`;
}

export function draftRejectionEmail(candidate: DraftCandidate, jd?: DraftJobInfo): string {
  const name = greetingName(candidate.candidate_name);
  const role = roleOf(jd);
  const company = atCompany(jd);

  return (
    `Hi ${name},\n\n` +
    `Thanks for your interest in the role of ${role}${company}. We have now filled that role and are ` +
    `not moving forward with your application, but we hope you'll keep looking in the future. If there ` +
    `are any new open positions that match your profile, we will get in touch with you.\n\n` +
    `In the meantime, please keep an eye on our careers site. If you find an opportunity that interests ` +
    `you, feel free to apply again.\n\n` +
    `Wishing you all the best in your hunt for the perfect role,\n${SENDER_TEAM_NAME}`
  );
}
