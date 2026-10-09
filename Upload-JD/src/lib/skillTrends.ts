export interface TrendCandidate {
  matched_required_skills?: string[];
  matched_preferred_skills?: string[];
  requirement_coverage?: string[];
}

export type SkillCategory = "Required" | "Preferred";

export interface SkillTrendRow {
  skill: string;
  category: SkillCategory;
  haveCount: number;
  total: number;
  pct: number;
  tag: string;
}

const norm = (s: string) => s.trim().toLowerCase();

function hasSkill(candidate: TrendCandidate, key: string, category: SkillCategory): boolean {
  const field = category === "Required" ? "matched_required_skills" : "matched_preferred_skills";
  if ((candidate[field] ?? []).some((s) => norm(s) === key)) return true;
  if (category === "Required") {
    return (candidate.requirement_coverage ?? []).some((s) => norm(s) === key);
  }

  return false;
}

function coverage(skill: string, category: SkillCategory, candidates: TrendCandidate[]): number {
  const key = norm(skill);
  return candidates.filter((c) => hasSkill(c, key, category)).length;
}

function tagFor(category: SkillCategory, pct: number): string {
  if (category === "Required") {
    if (pct >= 70) return "Core & well covered";
    if (pct >= 40) return "Core, partially covered";
    return "Core, scarce in this pool";
  }
  if (pct >= 50) return "Bonus skill, well covered";
  if (pct >= 20) return "Bonus skill, somewhat available";
  return "Bonus skill, rare in this pool";
}

export function computeSkillTrends(
  requiredSkills: string[],
  preferredSkills: string[],
  candidates: TrendCandidate[]
): SkillTrendRow[] {
  const total = candidates.length;
  const seen = new Set<string>();
  const rows: SkillTrendRow[] = [];

  const addAll = (skills: string[], category: SkillCategory) => {
    for (const skill of skills) {
      const key = norm(skill);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      const haveCount = total ? coverage(skill, category, candidates) : 0;
      const pct = total ? Math.round((haveCount / total) * 100) : 0;
      rows.push({ skill: skill.trim(), category, haveCount, total, pct, tag: tagFor(category, pct) });
    }
  };

  addAll(requiredSkills, "Required");
  addAll(preferredSkills, "Preferred");

  return rows.sort((a, b) => {
    if (a.category !== b.category) return a.category === "Required" ? -1 : 1;
    return b.pct - a.pct;
  });
}

export const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export interface RadarDatum {
  label: string;
  value: number; 
}

export function buildRadarSvg(data: RadarDatum[], size = 360): string {
  const points = data.slice(0, 10);
  const n = points.length;

  if (n < 3) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <text x="${size / 2}" y="${size / 2}" text-anchor="middle" font-size="12" fill="#6b7280">Not enough skills for a radar chart</text>
    </svg>`;
  }

  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.34;
  const labelRadius = size * 0.46;

  const angleFor = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const coordsAt = (i: number, r: number) => {
    const a = angleFor(i);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };

  const rings = [0.25, 0.5, 0.75, 1].map((f) => {
    const ringPoints = points
      .map((_, i) => {
        const { x, y } = coordsAt(i, radius * f);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    return `<polygon points="${ringPoints}" fill="none" stroke="#e5e7eb" stroke-width="1" />`;
  });

  const spokes = points
    .map((_, i) => {
      const { x, y } = coordsAt(i, radius);
      return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-width="1" />`;
    })
    .join("");

  const dataPoints = points
    .map((d, i) => {
      const r = (Math.max(0, Math.min(100, d.value)) / 100) * radius;
      const { x, y } = coordsAt(i, r);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const dots = points
    .map((d, i) => {
      const r = (Math.max(0, Math.min(100, d.value)) / 100) * radius;
      const { x, y } = coordsAt(i, r);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#dc2626"><title>${escapeHtml(
        d.label
      )}: ${d.value}%</title></circle>`;
    })
    .join("");

  const labels = points
    .map((d, i) => {
      const { x, y } = coordsAt(i, labelRadius);
      const anchor = Math.abs(Math.cos(angleFor(i))) < 0.2 ? "middle" : Math.cos(angleFor(i)) > 0 ? "start" : "end";
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="11" fill="#374151"><title>${escapeHtml(
        d.label
      )}</title>${escapeHtml(truncate(d.label, 16))}</text>`;
    })
    .join("");

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" font-family="Inter, system-ui, sans-serif">
    ${rings.join("\n")}
    ${spokes}
    <polygon points="${dataPoints}" fill="#dc2626" fill-opacity="0.18" stroke="#dc2626" stroke-width="2" />
    ${dots}
    ${labels}
  </svg>`;
}

export interface SkillTrendsReportOptions {
  jobTitle?: string | null;
  company?: string | null;
  candidateCount: number;
  rows: SkillTrendRow[];
}

export function generateSkillTrendsReportHtml(options: SkillTrendsReportOptions): string {
  const { jobTitle, company, candidateCount, rows } = options;
  const role = jobTitle?.trim() || "this role";
  const companyLine = company?.trim() ? ` at ${escapeHtml(company.trim())}` : "";

  const radarData: RadarDatum[] = rows
    .filter((r) => r.category === "Required")
    .map((r) => ({ label: r.skill, value: r.pct }))
    .concat(
      rows
        .filter((r) => r.category === "Preferred")
        .map((r) => ({ label: r.skill, value: r.pct }))
    )
    .slice(0, 10);

  const radarSvg = buildRadarSvg(radarData);

  const tableRows = rows
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.skill)}</td>
        <td>${r.category}</td>
        <td>${r.haveCount} / ${r.total}</td>
        <td>${r.pct}%</td>
        <td>${escapeHtml(r.tag)}</td>
      </tr>`
    )
    .join("\n");

  const generatedAt = new Date().toLocaleString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Skill Trends Report — ${escapeHtml(role)}</title>
<style>
  body { font-family: Inter, system-ui, -apple-system, Arial, sans-serif; color: #111827; max-width: 860px; margin: 2rem auto; padding: 0 1.5rem; }
  h1 { font-size: 1.4rem; margin-bottom: 0.25rem; }
  .subtitle { color: #6b7280; font-size: 0.85rem; margin-bottom: 1.5rem; }
  .note { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; font-size: 0.8rem; padding: 0.6rem 0.9rem; border-radius: 8px; margin-bottom: 1.5rem; }
  .chart-wrap { display: flex; justify-content: center; margin-bottom: 1.5rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
  th, td { text-align: left; padding: 0.45rem 0.6rem; border-bottom: 1px solid #e5e7eb; }
  th { background: #f9fafb; font-weight: 600; }
  tr:nth-child(even) td { background: #fafafa; }
  .footer { margin-top: 1.5rem; font-size: 0.72rem; color: #9ca3af; }
  @media print { body { margin: 0.5rem auto; } }
</style>
</head>
<body>
  <h1>Skill Trends Report — ${escapeHtml(role)}${companyLine}</h1>
  <p class="subtitle">${candidateCount} candidate${candidateCount === 1 ? "" : "s"} parsed · generated ${escapeHtml(generatedAt)}</p>
  <p class="note">
    "Trend" here reflects how common each JD skill is within this specific batch of parsed resumes —
    not an external industry/market-trend data source.
  </p>

  <div class="chart-wrap">${radarSvg}</div>

  <table>
    <thead>
      <tr><th>Skill</th><th>Category</th><th>Have it</th><th>Coverage</th><th>Read</th></tr>
    </thead>
    <tbody>
      ${tableRows || '<tr><td colspan="5">No JD skills were detected to analyze.</td></tr>'}
    </tbody>
  </table>

  <p class="footer">Generated by the Candidate Ranking tool.</p>
</body>
</html>`;
}