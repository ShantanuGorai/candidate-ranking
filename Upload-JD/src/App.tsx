import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileUploadCard, UploadedFile } from "@/components/ui/file-upload-card";
import { Button } from "@/components/ui/button";
import {
  getChatReply,
  detectSkillQuery,
  formatSkillRelevanceReply,
  type SkillRelevanceResult,
} from "@/lib/recruiterBot";
import {
  draftInterviewEmail,
  draftRejectionEmail,
  interviewEmailSubject,
  rejectionEmailSubject,
  type DraftJobInfo,
} from "@/lib/emailDrafts";
import {
  computeSkillTrends,
  buildRadarSvg,
  generateSkillTrendsReportHtml,
} from "@/lib/skillTrends";
import "./App.css";

interface ChatMessage {
  role: "user" | "bot";
  text: string;
  /** A user bubble stays invisible while its "flight" from the input box
   * plays; it is revealed once the flying copy lands on top of it. */
  pending?: boolean;
}

/** State for the ghost bubble that flies from the typing box to the chat. */
interface FlyingMessage {
  index: number;
  text: string;
  width: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

const CHAT_GREETING =
  "Hi! I'm your recruiting assistant. Tap the guide below for examples, or just start typing.";

const CHAT_GUIDE_TIPS: { title: string; example: string }[] = [
  {
    title: "Compare two candidates",
    example: '"Should I shortlist Priya or Raj?"',
  },
  {
    title: "Weigh a trade-off",
    example: '"He has more experience but fewer skills, should I hire him?"',
  },
  {
    title: "Check a skill against the JD",
    example: 'Just type a skill, like "scikit-learn"',
  },
  {
    title: "Get a shortlist",
    example: '"Who should I shortlist?"',
  },
];

interface SkillRelevanceJdInfo {
  required_skills?: string[];
  preferred_skills?: string[];
  description?: string;
}

interface RecruiterChatProps {
  candidates: RankedCandidate[];
  jd?: SkillRelevanceJdInfo;
}

function ChatGuide({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25, ease: "easeInOut" }}
      // shrink-0 stops the flex column from squashing the guide when the
      // message list grows; the inner card scrolls instead.
      className="overflow-hidden shrink-0"
    >
      <div className="mx-3 mt-3 mb-1 max-h-[28vh] overflow-y-auto overscroll-contain rounded-2xl border border-white/50 bg-white/40 backdrop-blur-md p-3 shadow-sm text-left">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-[11px] font-semibold text-foreground text-left">
            How to use this assistant
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close guide"
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Got it
          </button>
        </div>
        <ol className="space-y-2.5 text-left">
          {CHAT_GUIDE_TIPS.map((tip, i) => (
            <li key={tip.title} className="grid grid-cols-[1.25rem_1fr] items-start">
              <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">
                {i + 1}.
              </span>
              <div className="min-w-0 text-left">
                <p className="text-[11px] font-medium text-foreground leading-snug text-left">
                  {tip.title}
                </p>
                <p className="text-[10px] text-muted-foreground italic leading-snug mt-0.5 text-left">
                  {tip.example}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </motion.div>
  );
}

/** A thin diagonal highlight across the top of a bubble, like light catching
 * the surface of glass. Purely decorative, sits above the bubble's own
 * background and below its text. */
function GlassSheen() {
  return (
    <div
      className="absolute inset-0 rounded-2xl pointer-events-none"
      style={{
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.12) 35%, rgba(255,255,255,0) 60%)",
      }}
    />
  );
}

function ChatBubble({ message, index }: { message: ChatMessage; index: number }) {
  const isUser = message.role === "user";
  return (
    <motion.div
      // Outgoing (user) bubbles don't animate themselves: a ghost copy flies
      // from the typing box to this spot, and this bubble is revealed (via
      // `pending`) when the ghost lands. Incoming (bot) replies arrive from
      // the left.
      initial={isUser ? { opacity: 0 } : { opacity: 0, scale: 0.85, y: 10, x: -28 }}
      animate={
        isUser
          ? { opacity: message.pending ? 0 : 1 }
          : { opacity: 1, scale: 1, y: 0, x: 0 }
      }
      transition={
        isUser
          ? { duration: 0 }
          : { type: "spring", stiffness: 420, damping: 32, delay: index === 0 ? 0 : 0.02 }
      }
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        data-pending-bubble={message.pending ? "" : undefined}
        className={`relative overflow-hidden max-w-[85%] rounded-2xl px-3 py-2 text-xs text-left leading-relaxed whitespace-pre-line shadow-sm backdrop-blur-lg backdrop-saturate-150 border ${
          isUser
            ? "bg-gradient-to-br from-indigo-500/85 via-violet-500/85 to-fuchsia-500/85 border-white/30 text-white"
            : "bg-white/40 border-white/60 text-foreground"
        }`}
      >
        <GlassSheen />
        <span className="relative">{message.text}</span>
      </div>
    </motion.div>
  );
}

function ThinkingBubble() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 10, x: -28 }}
      animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
      exit={{ opacity: 0, scale: 0.85 }}
      className="flex justify-start"
    >
      <div className="relative overflow-hidden bg-white/40 backdrop-blur-lg backdrop-saturate-150 border border-white/60 rounded-2xl px-3 py-2.5 flex items-center gap-1 shadow-sm">
        <GlassSheen />
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="relative h-1.5 w-1.5 rounded-full bg-muted-foreground/70"
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
          />
        ))}
      </div>
    </motion.div>
  );
}

function RecruiterChat({ candidates, jd }: RecruiterChatProps) {
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [thinking, setThinking] = React.useState(false);
  const [showGuide, setShowGuide] = React.useState(true);
  const [flying, setFlying] = React.useState<FlyingMessage | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ role: "bot", text: CHAT_GREETING }]);
    }
  }, [open, messages.length]);

  React.useEffect(() => {
    // A pending user bubble is positioned instantly by the flight effect
    // below, so skip the smooth scroll for it.
    if (messages[messages.length - 1]?.pending) return;
    const el = scrollRef.current;
    if (el && typeof el.scrollTo === "function") {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages, thinking]);

  // When a new (invisible) user bubble lands in the list, measure where it
  // sits and where the input box is, then launch the flying ghost between them.
  React.useLayoutEffect(() => {
    const index = messages.length - 1;
    const last = messages[index];
    if (!last?.pending || flying) return;

    const panel = panelRef.current;
    const scroller = scrollRef.current;
    const inputEl = inputRef.current;
    const bubble = scroller?.querySelector<HTMLElement>("[data-pending-bubble]");

    if (!panel || !scroller || !inputEl || !bubble) {
      // Can't animate; just reveal the message.
      setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, pending: false } : m)));
      return;
    }

    // Jump to the bottom so the bubble is at its final resting position.
    scroller.scrollTop = scroller.scrollHeight;

    const p = panel.getBoundingClientRect();
    const i = inputEl.getBoundingClientRect();
    const b = bubble.getBoundingClientRect();

    setFlying({
      index,
      text: last.text,
      width: b.width,
      fromX: i.left - p.left + 12,
      fromY: i.top - p.top + (i.height - b.height) / 2,
      toX: b.left - p.left,
      toY: b.top - p.top,
    });
  }, [messages, flying]);

  const finishFlight = () => {
    if (!flying) return;
    const idx = flying.index;
    setMessages((prev) => prev.map((m, i) => (i === idx ? { ...m, pending: false } : m)));
    setFlying(null);
  };

  const send = async () => {
    const text = input.trim();
    if (!text) return;

    setMessages((prev) => [...prev, { role: "user", text, pending: true }]);
    setInput("");
    setThinking(true);

    const skillQuery = detectSkillQuery(text, candidates);

    if (skillQuery) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/skill-relevance`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            skill: skillQuery,
            required_skills: jd?.required_skills ?? [],
            preferred_skills: jd?.preferred_skills ?? [],
            description: jd?.description ?? "",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not check that skill against the JD.");
        const reply = formatSkillRelevanceReply(data as SkillRelevanceResult);
        setMessages((prev) => [...prev, { role: "bot", text: reply }]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            role: "bot",
            text:
              err instanceof Error
                ? `I couldn't check that against the JD: ${err.message}`
                : "I couldn't check that against the JD right now.",
          },
        ]);
      } finally {
        setThinking(false);
      }
      return;
    }

    setTimeout(() => {
      const reply = getChatReply(text, candidates);
      setMessages((prev) => [...prev, { role: "bot", text: reply }]);
      setThinking(false);
    }, 450);
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, scale: 0.3, y: 48, borderRadius: 32 }}
            animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 28 }}
            exit={{ opacity: 0, scale: 0.3, y: 48, borderRadius: 32 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            style={{ transformOrigin: "bottom left" }}
            className="fixed bottom-24 left-6 z-50 w-[23rem] max-w-[calc(100vw-3rem)] max-h-[80vh] flex flex-col overflow-hidden border border-white/40 shadow-2xl"
          >
            {/* Liquid-glass backdrop: colorful gradient showing through a frosted blur */}
            <div
              className="absolute inset-0 -z-10"
              style={{
                background:
                  "linear-gradient(145deg, rgba(99,102,241,0.35), rgba(217,70,239,0.25), rgba(255,255,255,0.55))",
              }}
            />
            <div className="absolute inset-0 -z-10 backdrop-blur-2xl backdrop-saturate-150 bg-white/30" />

            <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/40 bg-white/20 backdrop-blur-md shrink-0">
              <div>
                <p className="text-sm font-semibold text-foreground">Recruiting Assistant</p>
                <p className="text-[10px] text-muted-foreground">Ask about any candidate</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowGuide((v) => !v)}
                  aria-label="Toggle user guide"
                  title="Settings"
                  className="h-7 w-7 flex items-center justify-center rounded-full text-muted-foreground hover:bg-white/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close chat"
                  className="h-7 w-7 flex items-center justify-center rounded-full text-muted-foreground hover:bg-white/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            </div>

            <AnimatePresence initial={false}>
              {showGuide && <ChatGuide onClose={() => setShowGuide(false)} />}
            </AnimatePresence>

            <div
              ref={scrollRef}
              className="chat-scroll flex-1 min-h-[8rem] overflow-y-auto px-3 pt-3 pb-5 space-y-2.5"
              style={{
                maskImage:
                  "linear-gradient(to bottom, transparent, black 16px, black calc(100% - 16px), transparent)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, transparent, black 16px, black calc(100% - 16px), transparent)",
              }}
            >
              {messages.map((m, i) => (
                <ChatBubble key={i} message={m} index={i} />
              ))}
              <AnimatePresence>{thinking && <ThinkingBubble key="thinking" />}</AnimatePresence>
            </div>

            <div className="flex items-center gap-2 border-t border-white/40 bg-white/20 backdrop-blur-md p-2 shrink-0">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") send();
                }}
                placeholder="e.g. Should I shortlist Priya?"
                className="flex-1 h-9 px-3 text-xs rounded-full border border-white/60 bg-white/50 backdrop-blur-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <motion.button
                type="button"
                onClick={send}
                disabled={!input.trim()}
                whileTap={{ scale: 0.9 }}
                className="shrink-0 h-9 w-9 rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white flex items-center justify-center shadow-sm disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label="Send message"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </motion.button>
            </div>

            {/* Flying ghost: the outgoing message glides from the typing box
                to its spot in the chat, then the real bubble is revealed. */}
            {flying && (
              <motion.div
                className="absolute left-0 top-0 z-20 pointer-events-none"
                style={{ width: flying.width }}
                initial={{ x: flying.fromX, y: flying.fromY, scale: 0.85, opacity: 0.9 }}
                animate={{ x: flying.toX, y: flying.toY, scale: 1, opacity: 1 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                onAnimationComplete={finishFlight}
              >
                <div className="relative overflow-hidden rounded-2xl px-3 py-2 text-xs text-left leading-relaxed whitespace-pre-line shadow-sm backdrop-blur-lg border bg-gradient-to-br from-indigo-500/85 via-violet-500/85 to-fuchsia-500/85 border-white/30 text-white">
                  <GlassSheen />
                  <span className="relative">{flying.text}</span>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close recruiting assistant" : "Open recruiting assistant"}
        className="fixed bottom-6 left-6 z-50 h-14 w-14 rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-lg shadow-indigo-500/30 flex items-center justify-center text-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        animate={open ? { y: 0, rotate: 0 } : { y: [0, -8, 0] }}
        transition={
          open
            ? { duration: 0.2 }
            : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }
        }
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        )}
      </motion.button>
    </>
  );
}

const API_BASE_URL = "http://localhost:5000";

type Step = "jd" | "resumes" | "ranking" | "result";

interface RankedCandidate {
  candidate_id?: string;
  candidate_name?: string;
  rank: number;
  score: number;
  recommendation?: string;
  missing_required_skills?: string[];
  missing_preferred_skills?: string[];
  experience_details?: {
    required_years?: number | null;
    candidate_years?: number | null;
  };
  explanation?: {
    positive_factors?: string[];
    skill_gaps?: string[];
  };
  matched_required_skills?: string[];
  matched_preferred_skills?: string[];
  contact?: { email?: string | null; phone?: string | null };
  duplicate_of?: string;
  interview_questions?: string[];
  component_scores?: Record<string, number>;
  weights?: Record<string, number>;
  evidence?: { requirement: string; evidence: string; similarity: number }[];
  near_misses?: { skill: string; closest: string; similarity: number }[];
  requirement_coverage?: string[];
  parse_confidence?: { level: "high" | "medium" | "low"; score: number; reasons: string[] };
  original_rank?: number;
  original_score?: number;
  original_recommendation?: string;
  [key: string]: unknown;
}

type SortKey = "rank" | "name";
type FilterKey = "all" | "shortlisted" | "duplicates";

type Stage = "New" | "Shortlisted" | "Interview Invited" | "Rejected" | "Hired";
const STAGES: Stage[] = ["New", "Shortlisted", "Interview Invited", "Rejected", "Hired"];
const STAGE_STYLES: Record<Stage, string> = {
  New: "bg-muted text-muted-foreground",
  Shortlisted: "bg-sky-100 text-sky-700",
  "Interview Invited": "bg-indigo-100 text-indigo-700",
  Rejected: "bg-red-100 text-red-700",
  Hired: "bg-green-100 text-green-700",
};

const COMPONENT_LABELS: Record<string, string> = {
  required_skills: "Required skills",
  preferred_skills: "Preferred skills",
  experience: "Experience",
  education: "Education",
  semantic_similarity: "JD alignment",
};

interface SkillDemandRow {
  skill: string;
  haveCount: number;
  total: number;
  pct: number;
}

// How rare is each JD-required skill across THIS batch of candidates?
// Rarest first, so a recruiter can tell "one weak candidate" apart from
// "nobody in this pool has Docker, maybe the JD is asking for too much."
export function computeSkillDemand(
  requiredSkills: string[],
  candidates: { matched_required_skills?: string[] }[]
): SkillDemandRow[] {
  const total = candidates.length;
  if (!total || !requiredSkills.length) return [];

  const seen = new Set<string>();
  const rows: SkillDemandRow[] = [];

  for (const skill of requiredSkills) {
    const key = skill.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const haveCount = candidates.filter((c) =>
      (c.matched_required_skills ?? []).some((s) => s.trim().toLowerCase() === key)
    ).length;

    rows.push({ skill, haveCount, total, pct: Math.round((haveCount / total) * 100) });
  }

  return rows.sort((a, b) => a.pct - b.pct);
}

const WEIGHT_KEYS = [
  "required_skills",
  "experience",
  "semantic_similarity",
  "education",
  "preferred_skills",
];

const CLUSTER_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ec4899"];

// Mirrors scorer.py's get_recommendation() thresholds, so a live-reweighted
// score always gets a label consistent with what the backend would say for
// that same score.
const recommendationForScore = (score: number): string => {
  if (score >= 85) return "High";
  if (score >= 70) return "Good";
  if (score >= 55) return "Average";
  if (score >= 40) return "Below Average";
  return "Low";
};

const RECOMMENDATION_STYLES: Record<string, string> = {
  high: "bg-green-100 text-green-700",
  good: "bg-lime-100 text-lime-700",
  average: "bg-amber-100 text-amber-700",
  "below average": "bg-orange-100 text-orange-700",
  low: "bg-red-100 text-red-700",
};

const csvEscape = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

interface ScoreRingProps {
  score: number;
  size?: number;
}

function ScoreRing({ score, size = 44 }: ScoreRingProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const strokeWidth = size >= 60 ? 6 : 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  // Low scores render red, high scores render yellow, with a smooth
  // red -> orange -> yellow sweep in between.
  const hue = (clamped / 100) * 50; // 0 = red, 50 = yellow
  const ringColor = `hsl(${hue}, 88%, 45%)`;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s ease, stroke 0.8s ease" }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-semibold text-foreground tabular-nums"
        style={{ fontSize: size >= 60 ? 16 : 11 }}
      >
        {Math.round(clamped)}
      </span>
    </div>
  );
}

interface AnimatedScoreRingProps {
  score: number;
  active: boolean;
  size?: number;
}

function AnimatedScoreRing({ score, active, size }: AnimatedScoreRingProps) {
  const [displayScore, setDisplayScore] = React.useState(0);

  React.useEffect(() => {
    if (!active) {
      setDisplayScore(0);
      return;
    }
    setDisplayScore(0);
    const timer = setTimeout(() => setDisplayScore(score), 60);
    return () => clearTimeout(timer);
  }, [active, score]);

  return <ScoreRing score={displayScore} size={size} />;
}

interface ChevronIconProps {
  open: boolean;
}

function ChevronIcon({ open }: ChevronIconProps) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-muted-foreground transition-transform duration-200"
      style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
    >
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  );
}

interface RankResponse {
  jd: Record<string, unknown> & {
    required_skills?: string[];
    preferred_skills?: string[];
    description?: string;
    job_title?: string | null;
    company?: string | null;
  };
  results: Record<string, unknown>[];
  ranked_candidates: RankedCandidate[];
  talent_map?: {
    jd: { x: number; y: number };
    points: {
      candidate_id: string;
      x: number;
      y: number;
      cluster: number | null;
      jd_similarity: number;
    }[];
  } | null;
  error?: string;
}

const toUploadedFiles = (files: File[], prefix: string): UploadedFile[] =>
  files.map((file, index) => ({
    id: `${prefix}-${file.name}-${Date.now()}-${index}`,
    file,
    progress: 100,
    status: "completed",
  }));

interface TalentMapProps {
  talentMap: NonNullable<RankResponse["talent_map"]>;
  candidates: RankedCandidate[];
  blind: boolean;
}

function TalentMap({ talentMap, candidates, blind }: TalentMapProps) {
  const width = 460;
  const height = 250;
  const pad = 28;
  const px = (x: number) => pad + x * (width - pad * 2);
  const py = (y: number) => height - pad - y * (height - pad * 2);

  const lookup = new Map(
    candidates.map((c) => [String(c.candidate_id ?? c.original_rank ?? c.rank), c])
  );

  return (
    <div className="mb-5 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-xs font-semibold text-foreground">Talent map</p>
        <p className="text-[10px] text-muted-foreground">
          Closer to the star = closer match to the job description
        </p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        <rect x="0" y="0" width={width} height={height} rx="8" className="fill-background" />
        {[0.25, 0.5, 0.75].map((t) => (
          <g key={t} className="stroke-muted">
            <line x1={px(t)} x2={px(t)} y1={pad} y2={height - pad} strokeDasharray="3 4" />
            <line x1={pad} x2={width - pad} y1={py(t)} y2={py(t)} strokeDasharray="3 4" />
          </g>
        ))}

        {talentMap.points.map((point, i) => {
          const candidate = lookup.get(String(point.candidate_id));
          const color =
            point.cluster === null ? "#64748b" : CLUSTER_COLORS[point.cluster % CLUSTER_COLORS.length];
          const label = candidate?.rank ?? "?";
          const name = candidate
            ? blind
              ? `Candidate ${candidate.original_rank ?? candidate.rank}`
              : candidate.candidate_name ?? "Unknown"
            : "Unknown";

          return (
            <motion.g
              key={point.candidate_id}
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.1 + i * 0.06 }}
              style={{ transformOrigin: `${px(point.x)}px ${py(point.y)}px` }}
            >
              <title>{`${name} · ${Math.round(point.jd_similarity * 100)}% similar to the JD`}</title>
              <circle cx={px(point.x)} cy={py(point.y)} r="11" fill={color} fillOpacity="0.18" />
              <circle cx={px(point.x)} cy={py(point.y)} r="8" fill={color} />
              <text
                x={px(point.x)}
                y={py(point.y) + 3}
                textAnchor="middle"
                fontSize="9"
                fontWeight="700"
                fill="#fff"
              >
                {label}
              </text>
            </motion.g>
          );
        })}

        <g>
          <title>Job description</title>
          <text
            x={px(talentMap.jd.x)}
            y={py(talentMap.jd.y) + 6}
            textAnchor="middle"
            fontSize="22"
            fill="#eab308"
          >
            ★
          </text>
        </g>
      </svg>
      <p className="text-[10px] text-muted-foreground mt-1">
        Numbers are current ranks. Axes are abstract (PCA of resume embeddings); only distances
        matter. Colours group similar profiles when there are four or more candidates.
      </p>
    </div>
  );
}

interface EmailComposerProps {
  candidate: RankedCandidate;
  jd?: DraftJobInfo;
  kind: "interview" | "reject";
  onClose: () => void;
  onSent?: (kind: "interview" | "reject") => void;
}

function EmailComposer({ candidate, jd, kind, onClose, onSent }: EmailComposerProps) {
  const [date, setDate] = React.useState("");
  const [meetingMode, setMeetingMode] = React.useState("Video call");
  const [to, setTo] = React.useState(candidate.contact?.email ?? "");
  const [subject, setSubject] = React.useState(
    kind === "interview" ? interviewEmailSubject(jd) : rejectionEmailSubject(jd)
  );
  const [body, setBody] = React.useState(() =>
    kind === "interview"
      ? draftInterviewEmail(candidate, { date: "", mode: meetingMode }, jd)
      : draftRejectionEmail(candidate, jd)
  );
  const [bodyEdited, setBodyEdited] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null);

  // Keep regenerating the body from date/mode as long as the recruiter
  // hasn't manually edited it yet. Once they touch the textarea, their
  // edits win and we stop overwriting them.
  React.useEffect(() => {
    if (kind !== "interview" || bodyEdited) return;
    setBody(draftInterviewEmail(candidate, { date, mode: meetingMode }, jd));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, meetingMode, kind, bodyEdited]);

  const handleSend = async () => {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send email.");
      setResult({ ok: true, message: `Sent to ${data.to ?? to}.` });
      onSent?.(kind);
    } catch (err) {
      setResult({
        ok: false,
        message: err instanceof Error ? err.message : "Failed to send email.",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="overflow-hidden"
    >
      <div className="mt-3 rounded-lg border bg-muted/20 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-foreground">
            {kind === "interview" ? "Interview invite" : "Rejection email"}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor={`to-${kind}`} className="text-[11px] text-muted-foreground w-14 shrink-0">
            To
          </label>
          <input
            id={`to-${kind}`}
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="candidate@example.com"
            className="flex-1 h-8 px-2 text-xs rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {kind === "interview" && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label htmlFor="interview-date" className="text-[11px] text-muted-foreground shrink-0">
                Date
              </label>
              <input
                id="interview-date"
                type="text"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="e.g. Oct 5, 2026, 3:00 PM"
                className="h-8 px-2 text-xs rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="interview-mode" className="text-[11px] text-muted-foreground shrink-0">
                Mode
              </label>
              <select
                id="interview-mode"
                value={meetingMode}
                onChange={(e) => setMeetingMode(e.target.value)}
                className="h-8 px-2 text-xs rounded-md border bg-background"
              >
                <option>Video call</option>
                <option>Phone call</option>
                <option>In-person</option>
              </select>
            </div>
          </div>
        )}

        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          aria-label="Email subject"
          className="w-full h-8 px-2 text-xs font-medium rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
        />

        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setBodyEdited(true);
          }}
          rows={9}
          aria-label="Email body"
          className="w-full text-xs px-2 py-1.5 rounded-md border bg-background leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/30"
        />

        {result && (
          <p className={`text-xs ${result.ok ? "text-green-600" : "text-red-500"}`}>{result.message}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose} disabled={sending}>
            Close
          </Button>
          <Button size="sm" onClick={handleSend} disabled={sending || !to.trim()}>
            {sending ? "Sending..." : "Send"}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function App() {
  const [step, setStep] = React.useState<Step>("jd");
  const [jdFiles, setJdFiles] = React.useState<UploadedFile[]>([]);
  const [resumeFiles, setResumeFiles] = React.useState<UploadedFile[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [response, setResponse] = React.useState<RankResponse | null>(null);
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());
  const [search, setSearch] = React.useState("");
  const [sortBy, setSortBy] = React.useState<SortKey>("rank");
  const [filterBy, setFilterBy] = React.useState<FilterKey>("all");
  const [blindMode, setBlindMode] = React.useState(false);
  const [shortlisted, setShortlisted] = React.useState<Set<string>>(new Set());
  const [copied, setCopied] = React.useState<string | null>(null);
  const [composeState, setComposeState] = React.useState<Record<string, "interview" | "reject" | null>>({});
  const [customWeights, setCustomWeights] = React.useState<Record<string, number> | null>(null);
  const [showWeights, setShowWeights] = React.useState(false);
  const [showSkillTrends, setShowSkillTrends] = React.useState(false);

  const skillTrendRows = React.useMemo(() => {
    if (!response) return [];
    return computeSkillTrends(
      response.jd.required_skills ?? [],
      response.jd.preferred_skills ?? [],
      response.ranked_candidates
    );
  }, [response]);

  const skillTrendRadarSvg = React.useMemo(() => {
    const data = skillTrendRows.map((r) => ({ label: r.skill, value: r.pct }));
    return buildRadarSvg(data, 320);
  }, [skillTrendRows]);

  const handleDownloadSkillTrends = () => {
    if (!response) return;
    const html = generateSkillTrendsReportHtml({
      jobTitle: response.jd.job_title,
      company: response.jd.company,
      candidateCount: response.ranked_candidates.length,
      rows: skillTrendRows,
    });
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "skill_trends_report.html";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  const [stages, setStages] = React.useState<Record<string, Stage>>({});
  const [notes, setNotes] = React.useState<Record<string, string>>({});

  const stageOf = (id: string): Stage => stages[id] ?? "New";

  const setStage = (id: string, stage: Stage) => {
    setStages((prev) => ({ ...prev, [id]: stage }));
  };

  const toggleShortlist = (id: string) => {
    setShortlisted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Only bump a fresh candidate to "Shortlisted" -- never downgrade
        // someone already further along (e.g. already Interview Invited).
        setStages((s) => (s[id] && s[id] !== "New" ? s : { ...s, [id]: "Shortlisted" }));
      }
      return next;
    });
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied((c) => (c === text ? null : c)), 1500);
    } catch {
      /* clipboard unavailable, ignore */
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleJdChange = (files: File[]) => {
    setJdFiles(toUploadedFiles(files, "jd"));
  };

  const handleJdRemove = (id: string) => {
    setJdFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleResumesChange = (files: File[]) => {
    setResumeFiles((prev) => [...prev, ...toUploadedFiles(files, "resume")]);
  };

  const handleResumeRemove = (id: string) => {
    setResumeFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleRank = async () => {
    setStep("ranking");
    setError(null);
    setResponse(null);
    setCustomWeights(null);

    try {
      const formData = new FormData();
      formData.append("jd", jdFiles[0].file);
      resumeFiles.forEach((f) => formData.append("resumes", f.file));

      const res = await fetch(`${API_BASE_URL}/api/rank`, {
        method: "POST",
        body: formData,
      });

      const data: RankResponse = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Ranking failed.");
      }

      setResponse(data);
      setStep("result");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while ranking candidates."
      );
      setStep("resumes");
    }
  };

  const handleDownload = () => {
    if (!response) return;

    const blob = new Blob([JSON.stringify(response.ranked_candidates, null, 4)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ranked_candidates.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setStep("jd");
    setJdFiles([]);
    setResumeFiles([]);
    setResponse(null);
    setError(null);
    setSearch("");
    setSortBy("rank");
    setFilterBy("all");
    setBlindMode(false);
    setShortlisted(new Set());
    setExpandedIds(new Set());
    setCustomWeights(null);
    setShowWeights(false);
    setShowSkillTrends(false);
    setComposeState({});
    setStages({});
    setNotes({});
  };

  const candidateId = (c: RankedCandidate) =>
    String(c.candidate_id ?? c.original_rank ?? c.rank);

  const defaultWeights = React.useMemo<Record<string, number>>(() => {
    const fromApi = response?.ranked_candidates?.[0]?.weights;
    return fromApi ?? { required_skills: 35, experience: 25, semantic_similarity: 20, education: 10, preferred_skills: 10 };
  }, [response]);

  const activeWeights = customWeights ?? defaultWeights;

  // Live what-if re-ranking: re-weight each candidate's component scores.
  const rankedView = React.useMemo<RankedCandidate[]>(() => {
    const list = response?.ranked_candidates ?? [];

    if (!customWeights) {
      return list.map((c) => ({ ...c, original_rank: c.rank, original_score: c.score }));
    }

    const total = WEIGHT_KEYS.reduce((sum, k) => sum + (customWeights[k] ?? 0), 0) || 1;

    return list
      .map((c) => {
        const parts = c.component_scores ?? {};
        const rescored =
          WEIGHT_KEYS.reduce((sum, k) => sum + (parts[k] ?? 0) * (customWeights[k] ?? 0), 0) / total;
        const roundedScore = Math.round(rescored * 100) / 100;
        return {
          ...c,
          original_rank: c.rank,
          original_score: c.score,
          original_recommendation: c.recommendation,
          score: roundedScore,
          // Recompute the label from the new score so it never goes stale
          // relative to what's actually displayed (e.g. a 94 under custom
          // weights must not keep showing the default weights' "Low" tag).
          recommendation: recommendationForScore(roundedScore),
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((c, i) => ({ ...c, rank: i + 1 }));
  }, [response, customWeights]);

  const displayName = (c: RankedCandidate) =>
    blindMode ? `Candidate ${c.original_rank ?? c.rank}` : c.candidate_name ?? "Unknown";

  const displayedCandidates = React.useMemo(() => {
    const list = rankedView;
    const query = search.trim().toLowerCase();

    const filtered = list.filter((c) => {
      if (filterBy === "shortlisted" && !shortlisted.has(candidateId(c))) return false;
      if (filterBy === "duplicates" && !c.duplicate_of) return false;
      if (!query) return true;

      const haystack = [
        blindMode ? "" : c.candidate_name ?? "",
        ...(c.matched_required_skills ?? []),
        ...(c.missing_required_skills ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });

    return [...filtered].sort((a, b) =>
      sortBy === "name"
        ? (a.candidate_name ?? "").localeCompare(b.candidate_name ?? "")
        : a.rank - b.rank
    );
  }, [rankedView, search, sortBy, filterBy, shortlisted, blindMode]);

  const handleExportCsv = () => {
    if (!response) return;

    const source =
      shortlisted.size > 0
        ? rankedView.filter((c) => shortlisted.has(candidateId(c)))
        : rankedView;

    const header = [
      "Rank",
      "Name",
      "Score",
      "Recommendation",
      "Stage",
      "Email",
      "Phone",
      "Shortlisted",
      "Missing required skills",
      "Possible duplicate of",
      "Notes",
    ];

    const rows = source.map((c) => {
      const id = candidateId(c);
      return [
        c.rank,
        c.candidate_name ?? "",
        c.score,
        c.recommendation ?? "",
        stageOf(id),
        c.contact?.email ?? "",
        c.contact?.phone ?? "",
        shortlisted.has(id) ? "Yes" : "No",
        (c.missing_required_skills ?? []).join("; "),
        c.duplicate_of ?? "",
        notes[id] ?? "",
      ];
    });

    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = shortlisted.size > 0 ? "shortlisted_candidates.csv" : "all_candidates.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full min-h-screen flex flex-col items-center gap-6 p-4 py-10 bg-muted/30">
      <div className="w-full max-w-2xl text-center">
        {step === "result" && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 mb-3 rounded-full border bg-background text-xs font-medium text-muted-foreground">
            Results
          </span>
        )}
        <h1 className="text-2xl font-bold text-foreground">Candidate Ranking</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {step === "jd" && "Step 1 of 2: upload the job description."}
          {step === "resumes" && "Step 2 of 2: upload candidate resumes."}
          {step === "ranking" && "Ranking candidates..."}
          {step === "result" && (
            <>
              See exactly how each candidate matches your job description.
              <br />
              Need something changed? Write to{" "}
              <a
                href="mailto:webmobi360.co@gmail.com"
                className="font-semibold text-foreground"
              >
                webmobi360.co@gmail.com
              </a>
              .
            </>
          )}
        </p>
      </div>

      {step === "jd" && (
        <>
          <FileUploadCard
            files={jdFiles}
            onFilesChange={handleJdChange}
            onFileRemove={handleJdRemove}
            multiple={false}
            accept=".pdf"
            title="Upload Job Description"
            description="Upload the JD as a PDF"
            hint="PDF only, one file."
          />
          <Button
            className="w-full max-w-2xl"
            disabled={jdFiles.length !== 1}
            onClick={() => setStep("resumes")}
          >
            OK
          </Button>
        </>
      )}

      {step === "resumes" && (
        <>
          <FileUploadCard
            files={resumeFiles}
            onFilesChange={handleResumesChange}
            onFileRemove={handleResumeRemove}
            multiple
            accept=".pdf"
            title="Upload Resume(s)"
            description="Upload one or more candidate resumes"
            hint="PDF only, multiple files allowed."
          />

          {error && (
            <div className="w-full max-w-2xl rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-sm p-4">
              {error}
            </div>
          )}

          <div className="w-full max-w-2xl flex items-center gap-3">
            <Button variant="outline" onClick={() => setStep("jd")}>
              Back
            </Button>
            <Button
              className="flex-1"
              disabled={resumeFiles.length === 0}
              onClick={handleRank}
            >
              OK
            </Button>
          </div>
        </>
      )}

      {step === "ranking" && (
        <div className="w-full max-w-2xl bg-background rounded-xl border shadow-sm p-6 text-center text-sm text-muted-foreground">
          Ranking candidates against the job description...
        </div>
      )}

      {step === "result" && response && (
        <motion.div
          className="w-full max-w-2xl bg-background rounded-xl border shadow-sm p-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 className="text-lg font-semibold text-foreground">Results</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              className="transition-transform duration-150 hover:scale-[1.03]"
            >
              Download JSON
            </Button>
          </div>

          {response.ranked_candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No candidates could be ranked.</p>
          ) : (
            <div>
              {response.talent_map && response.talent_map.points.length >= 2 && (
                <TalentMap
                  talentMap={response.talent_map}
                  candidates={rankedView}
                  blind={blindMode}
                />
              )}

              {skillTrendRows.length > 0 && (
                <div className="mb-3">
                  <button
                    type="button"
                    onClick={() => setShowSkillTrends((v) => !v)}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
                  >
                    {showSkillTrends ? "Hide" : "Show"} skill trends across candidates
                  </button>

                  <AnimatePresence initial={false}>
                    {showSkillTrends && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 rounded-lg border bg-muted/20 p-3">
                          <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
                            <p className="text-[10px] text-muted-foreground max-w-xs">
                              How common each JD skill is within this batch of parsed resumes —
                              not an external industry trend source.
                            </p>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleDownloadSkillTrends}
                              className="transition-transform duration-150 hover:scale-[1.03]"
                            >
                              Download report
                            </Button>
                          </div>

                          <div className="flex justify-center mb-3">
                            <div dangerouslySetInnerHTML={{ __html: skillTrendRadarSvg }} />
                          </div>

                          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                            {skillTrendRows.map((row) => (
                              <div key={`${row.category}-${row.skill}`} className="flex items-center gap-2">
                                <span className="w-28 shrink-0 text-[11px] text-foreground truncate" title={row.skill}>
                                  {row.skill}
                                </span>
                                <span
                                  className={`shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded ${
                                    row.category === "Required"
                                      ? "bg-red-50 text-red-600"
                                      : "bg-amber-50 text-amber-600"
                                  }`}
                                >
                                  {row.category}
                                </span>
                                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                  <motion.div
                                    className="h-full rounded-full bg-foreground/70"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${row.pct}%` }}
                                    transition={{ duration: 0.6, ease: "easeOut" }}
                                  />
                                </div>
                                <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                                  {row.pct}%
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 mb-3">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name or skill..."
                  className="flex-1 min-w-[160px] h-9 px-3 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortKey)}
                  className="h-9 px-2 text-sm rounded-md border bg-background"
                  aria-label="Sort candidates"
                >
                  <option value="rank">Sort: Rank</option>
                  <option value="name">Sort: Name</option>
                </select>
                <select
                  value={filterBy}
                  onChange={(e) => setFilterBy(e.target.value as FilterKey)}
                  className="h-9 px-2 text-sm rounded-md border bg-background"
                  aria-label="Filter candidates"
                >
                  <option value="all">Show: All</option>
                  <option value="shortlisted">Show: Shortlisted ({shortlisted.size})</option>
                  <option value="duplicates">Show: Duplicates</option>
                </select>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={blindMode}
                    onChange={(e) => setBlindMode(e.target.checked)}
                    className="accent-foreground"
                  />
                  Blind screening (hide names and contact details)
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCsv}
                  className="transition-transform duration-150 hover:scale-[1.03]"
                >
                  {shortlisted.size > 0
                    ? `Export shortlist (${shortlisted.size}) CSV`
                    : "Export all CSV"}
                </Button>
              </div>

              <div className="mb-3">
                <button
                  type="button"
                  onClick={() => setShowWeights((v) => !v)}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
                >
                  {showWeights ? "Hide" : "Adjust"} scoring weights (what-if)
                  {customWeights ? " · custom active" : ""}
                </button>

                <AnimatePresence initial={false}>
                  {showWeights && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 rounded-lg border bg-muted/20 p-3 space-y-2">
                        {WEIGHT_KEYS.map((key) => {
                          const total =
                            WEIGHT_KEYS.reduce((sum, k) => sum + (activeWeights[k] ?? 0), 0) || 1;
                          const share = Math.round(((activeWeights[key] ?? 0) / total) * 100);
                          return (
                            <div key={key} className="flex items-center gap-3">
                              <span className="w-28 shrink-0 text-[11px] text-muted-foreground">
                                {COMPONENT_LABELS[key]}
                              </span>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                step={5}
                                value={activeWeights[key] ?? 0}
                                onChange={(e) =>
                                  setCustomWeights({
                                    ...activeWeights,
                                    [key]: Number(e.target.value),
                                  })
                                }
                                className="flex-1 accent-foreground"
                                aria-label={`${COMPONENT_LABELS[key]} weight`}
                              />
                              <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                                {share}%
                              </span>
                            </div>
                          );
                        })}
                        <div className="flex items-center justify-between pt-1">
                          <p className="text-[10px] text-muted-foreground">
                            Rankings update live. Recommendation labels reflect the default weights.
                          </p>
                          <button
                            type="button"
                            onClick={() => setCustomWeights(null)}
                            disabled={!customWeights}
                            className="text-[11px] font-medium text-foreground disabled:opacity-40 hover:underline"
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {displayedCandidates.length === 0 && (
                <p className="text-sm text-muted-foreground py-4">
                  No candidates match the current search or filter.
                </p>
              )}

              {displayedCandidates.map((candidate) => {
                const id = String(candidate.candidate_id ?? candidate.rank);
                const isOpen = expandedIds.has(id);
                const score = typeof candidate.score === "number" ? candidate.score : 0;

                const recommendation = candidate.recommendation
                  ? String(candidate.recommendation)
                  : null;
                const badgeClass =
                  RECOMMENDATION_STYLES[recommendation?.toLowerCase() ?? ""] ??
                  "bg-muted text-muted-foreground";

                const positives = candidate.explanation?.positive_factors ?? [];
                const gaps = candidate.explanation?.skill_gaps ?? [];
                const missingRequired = candidate.missing_required_skills ?? [];
                const missingPreferred = candidate.missing_preferred_skills ?? [];

                const requiredYears = candidate.experience_details?.required_years;
                const candidateYears = candidate.experience_details?.candidate_years;
                const hasExperienceGap =
                  typeof requiredYears === "number" &&
                  typeof candidateYears === "number" &&
                  candidateYears < requiredYears;

                return (
                  <motion.div
                    key={id}
                    className="border-b last:border-b-0"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: candidate.rank * 0.05 }}
                  >
                    <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(id)}
                      className="flex-1 min-w-0 flex items-center justify-between gap-3 py-4 text-left hover:bg-muted/40 transition-colors rounded-md px-1 -mx-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground transition-transform duration-200 group-hover:scale-105">
                          {candidate.rank}
                        </div>
                        <span className="text-sm font-semibold text-foreground truncate">
                          {displayName(candidate)}
                        </span>
                        {candidate.duplicate_of && (
                          <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                            Duplicate
                          </span>
                        )}
                        {stageOf(id) !== "New" && (
                          <span
                            className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${STAGE_STYLES[stageOf(id)]}`}
                          >
                            {stageOf(id)}
                          </span>
                        )}
                        {customWeights &&
                          candidate.original_rank !== undefined &&
                          candidate.original_rank !== candidate.rank && (
                            <span
                              className={`shrink-0 text-[10px] font-semibold tabular-nums ${
                                candidate.rank < candidate.original_rank
                                  ? "text-green-600"
                                  : "text-red-500"
                              }`}
                              title={`Was #${candidate.original_rank} with default weights`}
                            >
                              {candidate.rank < candidate.original_rank ? "▲" : "▼"}
                              {Math.abs(candidate.rank - candidate.original_rank)}
                            </span>
                          )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {recommendation && (
                          <span
                            className={`text-[11px] font-medium px-2 py-0.5 rounded-full transition-transform duration-200 hover:scale-105 ${badgeClass}`}
                          >
                            {recommendation}
                          </span>
                        )}
                        <ChevronIcon open={isOpen} />
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleShortlist(id)}
                      aria-label={shortlisted.has(id) ? "Remove from shortlist" : "Add to shortlist"}
                      title={shortlisted.has(id) ? "Shortlisted" : "Add to shortlist"}
                      className={`shrink-0 h-8 w-8 flex items-center justify-center rounded-md text-lg leading-none transition-all duration-150 hover:scale-110 hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                        shortlisted.has(id) ? "text-yellow-500" : "text-muted-foreground"
                      }`}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill={shortlisted.has(id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                      </svg>
                    </button>
                    </div>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          key="content"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: "easeInOut" }}
                          className="overflow-hidden"
                        >
                          <div className="pb-4 pl-10 pr-1">
                            <motion.div
                              className="flex items-center gap-4 mb-4"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ duration: 0.3, delay: 0.1 }}
                            >
                              <AnimatedScoreRing score={score} active={isOpen} size={64} />
                              <div className="text-xs text-muted-foreground min-w-0 flex-1">
                                Overall score based on required skills, experience,
                                education, and JD alignment.
                              </div>
                            </motion.div>

                            <div className="flex items-center gap-2 mb-3">
                              <label htmlFor={`stage-${id}`} className="text-[11px] text-muted-foreground shrink-0">
                                Stage
                              </label>
                              <select
                                id={`stage-${id}`}
                                value={stageOf(id)}
                                onChange={(e) => setStage(id, e.target.value as Stage)}
                                className={`h-7 px-2 text-[11px] font-medium rounded-md border focus:outline-none focus:ring-2 focus:ring-primary/30 ${STAGE_STYLES[stageOf(id)]}`}
                              >
                                {STAGES.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {candidate.duplicate_of && (
                              <div className="mb-3 text-xs rounded-md bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2">
                                Possible duplicate: this resume looks like the same person as{" "}
                                <span className="font-semibold">
                                  {blindMode ? "an earlier upload" : candidate.duplicate_of}
                                </span>
                                .
                              </div>
                            )}

                            {candidate.parse_confidence &&
                              candidate.parse_confidence.level !== "high" && (
                                <div
                                  className={`mb-3 text-xs rounded-md border px-3 py-2 ${
                                    candidate.parse_confidence.level === "low"
                                      ? "bg-red-50 border-red-200 text-red-700"
                                      : "bg-amber-50 border-amber-200 text-amber-700"
                                  }`}
                                >
                                  <span className="font-semibold">
                                    {candidate.parse_confidence.level === "low" ? "Low" : "Medium"}{" "}
                                    parsing confidence.
                                  </span>{" "}
                                  The score may understate this candidate, so review the PDF manually.
                                  <ul className="list-disc pl-4 mt-1">
                                    {candidate.parse_confidence.reasons.map((reason) => (
                                      <li key={reason}>{reason}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                            {!blindMode &&
                              (candidate.contact?.email || candidate.contact?.phone) && (
                                <div className="mb-3 flex flex-wrap gap-2">
                                  {[candidate.contact?.email, candidate.contact?.phone]
                                    .filter((v): v is string => Boolean(v))
                                    .map((value) => (
                                      <button
                                        key={value}
                                        type="button"
                                        onClick={() => copyText(value)}
                                        title="Click to copy"
                                        className="text-xs px-2 py-1 rounded-md border bg-background text-foreground transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                                      >
                                        {copied === value ? "Copied" : value}
                                      </button>
                                    ))}
                                </div>
                              )}

                            {candidate.component_scores && (
                              <div className="mb-4">
                                <p className="text-xs font-semibold text-foreground mb-1.5">
                                  Score breakdown
                                </p>
                                <div className="space-y-1.5">
                                  {Object.entries(candidate.component_scores).map(
                                    ([key, value]) => (
                                      <div key={key} className="flex items-center gap-2">
                                        <span className="w-28 shrink-0 text-[11px] text-muted-foreground">
                                          {COMPONENT_LABELS[key] ?? key}
                                        </span>
                                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                          <motion.div
                                            className="h-full rounded-full"
                                            style={{
                                              backgroundColor: `hsl(${(Math.max(0, Math.min(100, value)) / 100) * 50}, 88%, 45%)`,
                                            }}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                                            transition={{ duration: 0.7, ease: "easeOut", delay: 0.2 }}
                                          />
                                        </div>
                                        <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                                          {Math.round(value)}
                                        </span>
                                      </div>
                                    )
                                  )}
                                </div>
                              </div>
                            )}

                            {positives.length > 0 && (
                              <motion.div
                                className="mb-3"
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.25, delay: 0.15 }}
                              >
                                <p className="text-xs font-semibold text-foreground mb-1.5">
                                  Positive factors
                                </p>
                                <ul className="space-y-1">
                                  {positives.map((factor, i) => (
                                    <li
                                      key={`pos-${i}`}
                                      className="text-xs font-medium text-yellow-500 flex items-start gap-1.5 transition-transform duration-150 hover:translate-x-0.5"
                                    >
                                      <span className="shrink-0">+</span>
                                      <span>{factor}</span>
                                    </li>
                                  ))}
                                </ul>
                              </motion.div>
                            )}

                            {((candidate.matched_required_skills ?? []).length > 0 ||
                              (candidate.matched_preferred_skills ?? []).length > 0) && (
                              <div className="mb-3">
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                                  Matched skills
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {[
                                    ...(candidate.matched_required_skills ?? []),
                                    ...(candidate.matched_preferred_skills ?? []),
                                  ].map((skill, i) => (
                                    <span
                                      key={`matched-${i}`}
                                      className="text-[11px] font-medium px-2 py-1 rounded-md bg-green-50 text-green-700 border border-green-200 leading-snug transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm hover:bg-green-100 cursor-default"
                                    >
                                      {skill}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {(candidate.evidence ?? []).length > 0 && (
                              <div className="mb-3">
                                <p className="text-xs font-semibold text-foreground mb-1.5">
                                  Evidence from resume
                                </p>
                                <div className="space-y-2">
                                  {(candidate.evidence ?? []).map((item, i) => (
                                    <div
                                      key={`evidence-${i}`}
                                      className="rounded-md border-l-2 border-green-400 bg-green-50/60 pl-3 pr-2 py-1.5 transition-colors duration-150 hover:bg-green-50"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                          {item.requirement}
                                        </span>
                                        <span className="shrink-0 text-[10px] font-semibold tabular-nums text-green-700">
                                          {Math.round(item.similarity * 100)}% match
                                        </span>
                                      </div>
                                      <p className="text-xs text-foreground/80 italic leading-relaxed mt-0.5">
                                        “{item.evidence}”
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {(candidate.near_misses ?? []).length > 0 && (
                              <div className="mb-3">
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                                  Transferable skills (near matches)
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {(candidate.near_misses ?? []).map((item, i) => (
                                    <span
                                      key={`near-${i}`}
                                      title={`Missing "${item.skill}", but the resume lists "${item.closest}"`}
                                      className="text-[11px] font-medium px-2 py-1 rounded-md bg-sky-50 text-sky-700 border border-sky-200 leading-snug transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm hover:bg-sky-100 cursor-default"
                                    >
                                      {item.skill} ≈ {item.closest} ({Math.round(item.similarity * 100)}%)
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {(gaps.length > 0 ||
                              missingRequired.length > 0 ||
                              missingPreferred.length > 0 ||
                              hasExperienceGap) && (
                              <motion.div
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.25, delay: 0.2 }}
                              >
                                <p className="text-xs font-semibold text-foreground mb-1.5">
                                  Negative factors
                                </p>
                                <ul className="space-y-1 mb-2">
                                  {gaps.map((gap, i) => (
                                    <li
                                      key={`gap-${i}`}
                                      className="text-xs font-medium text-red-500 flex items-start gap-1.5 transition-transform duration-150 hover:translate-x-0.5"
                                    >
                                      <span className="shrink-0">-</span>
                                      <span>{gap}</span>
                                    </li>
                                  ))}
                                </ul>

                                {missingRequired.length > 0 && (
                                  <div className="mb-2">
                                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                                      Missing required skills
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {missingRequired.map((skill, i) => (
                                        <span
                                          key={`missing-req-${i}`}
                                          className="text-[11px] font-medium px-2 py-1 rounded-md bg-red-50 text-red-600 border border-red-200 leading-snug transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm hover:bg-red-100 hover:border-red-300 cursor-default"
                                        >
                                          {skill}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {missingPreferred.length > 0 && (
                                  <div className="mb-2">
                                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                                      Missing preferred skills
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {missingPreferred.map((skill, i) => (
                                        <span
                                          key={`missing-pref-${i}`}
                                          className="text-[11px] font-medium px-2 py-1 rounded-md bg-amber-50 text-amber-600 border border-amber-200 leading-snug transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm hover:bg-amber-100 hover:border-amber-300 cursor-default"
                                        >
                                          {skill}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {hasExperienceGap && (
                                  <span className="inline-block text-[11px] font-medium px-2 py-1 rounded-md bg-red-50 text-red-600 border border-red-200 leading-snug transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm hover:bg-red-100 hover:border-red-300 cursor-default">
                                    Experience: {candidateYears} yrs (needs {requiredYears} yrs)
                                  </span>
                                )}
                              </motion.div>
                            )}

                            {(candidate.interview_questions ?? []).length > 0 && (
                              <div className="mt-4 pt-3 border-t">
                                <p className="text-xs font-semibold text-foreground mb-1.5">
                                  Suggested interview questions
                                </p>
                                <ol className="list-decimal pl-4 space-y-1.5">
                                  {(candidate.interview_questions ?? []).map((q, i) => (
                                    <li
                                      key={`q-${i}`}
                                      className="text-xs text-muted-foreground leading-relaxed"
                                    >
                                      {q}
                                    </li>
                                  ))}
                                </ol>
                              </div>
                            )}

                            <div className="mt-4 pt-3 border-t">
                              <label
                                htmlFor={`notes-${id}`}
                                className="text-xs font-semibold text-foreground mb-1.5 block"
                              >
                                Notes
                              </label>
                              <textarea
                                id={`notes-${id}`}
                                value={notes[id] ?? ""}
                                onChange={(e) => setNotes((prev) => ({ ...prev, [id]: e.target.value }))}
                                placeholder="e.g. Strong communicator on the call, referred by..."
                                rows={2}
                                className="w-full text-xs px-2 py-1.5 rounded-md border bg-background leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/30"
                              />
                              <p className="text-[10px] text-muted-foreground mt-1">
                                Saved for this session only — included in the CSV export.
                              </p>
                            </div>

                            <div className="mt-3 flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setComposeState((prev) => ({
                                    ...prev,
                                    [id]: prev[id] === "interview" ? null : "interview",
                                  }))
                                }
                              >
                                Interview invite
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setComposeState((prev) => ({
                                    ...prev,
                                    [id]: prev[id] === "reject" ? null : "reject",
                                  }))
                                }
                              >
                                Reject
                              </Button>
                            </div>

                            <AnimatePresence initial={false} mode="wait">
                              {composeState[id] && (
                                <EmailComposer
                                  key={composeState[id]}
                                  candidate={candidate}
                                  jd={{ roleTitle: response.jd.job_title, company: response.jd.company }}
                                  kind={composeState[id] as "interview" | "reject"}
                                  onClose={() => setComposeState((prev) => ({ ...prev, [id]: null }))}
                                  onSent={(kind) =>
                                    setStage(id, kind === "interview" ? "Interview Invited" : "Rejected")
                                  }
                                />
                              )}
                            </AnimatePresence>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          )}

          <Button
            variant="outline"
            className="w-full mt-4 transition-transform duration-150 hover:scale-[1.01]"
            onClick={handleReset}
          >
            Start over
          </Button>
        </motion.div>
      )}

      {step === "result" && response && (
        <RecruiterChat
          candidates={rankedView}
          jd={{
            required_skills: response.jd.required_skills,
            preferred_skills: response.jd.preferred_skills,
            description: response.jd.description,
          }}
        />
      )}
    </div>
  );
}

export default App;