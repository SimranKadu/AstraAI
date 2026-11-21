/**
 * Career Hub data, built from "ISRO Career Guide: Jobs, Exams & Resources" (data/careers).
 * Roles, exam routes, subjects, resources and the six-month plan come from that guide.
 * The book titles are standard textbooks suggested by ASTRAAI (the guide names no books).
 */
import guide from "./careers.json";

export type Book = { title: string; author: string };
export type ExamRoute = { title: string; points: string[]; link?: { name: string; url: string } };
export type Resource = { name: string; use: string; url: string };

export type CareerRole = {
  id: string;
  group: string;
  title: string;
  /** One line shown on the list page. */
  short: string;
  /** Short "related studies" line shown on the list page. */
  studies: string;
  work: string;
  goal: string | null;
  study: string;
  /** Education path with "→" between stages, when the guide gives one. */
  path: string | null;
  exams: string[];
  examNote: string;
  subjects: string[];
  subjectNote?: string;
  books: Book[];
  resources: string[];
};

type Guide = {
  updated: string;
  disclaimer: string;
  officialLinks: { name: string; url: string }[];
  groups: string[];
  examRoutes: Record<string, ExamRoute>;
  noSingleExam: string;
  subjects: Record<string, { area: string; topics: string }>;
  bookNote: string;
  bookDisclaimer: string;
  resources: Record<string, Resource>;
  prepSteps: string[];
  plan: { month: number; focus: string }[];
  dailyRoutine: string;
  checklist: string[];
  roles: CareerRole[];
};

export const CAREER_GUIDE = guide as Guide;
export const CAREER_ROLES = CAREER_GUIDE.roles;

/** The full detail of one role, with the shared guide sections it points to filled in. */
export function roleDetail(role: CareerRole) {
  return {
    examRoutes: role.exams.map((key) => CAREER_GUIDE.examRoutes[key]).filter((r): r is ExamRoute => Boolean(r)),
    subjects: role.subjects.map((key) => CAREER_GUIDE.subjects[key]).filter((s): s is { area: string; topics: string } => Boolean(s)),
    resources: role.resources.map((key) => CAREER_GUIDE.resources[key]).filter((r): r is Resource => Boolean(r)),
  };
}
