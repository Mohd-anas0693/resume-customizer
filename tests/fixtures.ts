import type { JobAnalysis, Resume } from "@/lib/schema";

/** A software-engineer resume, used across the unit tests. */
export const softwareResume: Resume = {
  contact: {
    name: "Asha Verma",
    email: "asha.verma@example.com",
    phone: "+91 98000 11223",
    location: "Pune, India",
    links: [{ label: "GitHub", url: "https://github.com/ashaverma" }],
  },
  headline: "Full-stack developer",
  summary:
    "Developer with 3 years building web applications in TypeScript and Node, focused on REST services and relational data.",
  experience: [
    {
      id: "exp1",
      company: "Kettle Labs",
      title: "Software Engineer",
      location: "Pune",
      start: "2023-04",
      end: "Present",
      bullets: [
        { id: "exp1-b1", text: "Built REST services in Node and Express serving 40k daily requests." },
        { id: "exp1-b2", text: "Designed PostgreSQL schemas and wrote migrations for a billing module." },
        { id: "exp1-b3", text: "Added Jest unit tests, raising coverage from 35% to 78%." },
      ],
    },
    {
      id: "exp2",
      company: "Udaan Interactive",
      title: "Junior Developer",
      start: "2022-01",
      end: "2023-03",
      bullets: [
        { id: "exp2-b1", text: "Developed React components for an internal admin dashboard." },
        { id: "exp2-b2", text: "Fixed 60 reported bugs across two product releases." },
      ],
    },
  ],
  education: [
    {
      id: "edu1",
      school: "Savitribai Phule Pune University",
      degree: "B.E.",
      field: "Computer Engineering",
      start: "2018",
      end: "2022",
      details: [],
    },
  ],
  skills: [
    { id: "sk1", name: "Languages", items: ["TypeScript", "JavaScript", "Python", "SQL"] },
    { id: "sk2", name: "Frameworks", items: ["React", "Express", "Node"] },
    { id: "sk3", name: "Tools", items: ["Git", "Docker", "PostgreSQL"] },
  ],
  projects: [
    {
      id: "prj1",
      name: "Ledgerly",
      link: "https://github.com/ashaverma/ledgerly",
      bullets: [
        { id: "prj1-b1", text: "Expense tracker built with React and a Node API, deployed with Docker." },
      ],
    },
  ],
  certifications: [],
};

/** A JD this resume genuinely fits. */
export const strongFitAnalysis: JobAnalysis = {
  title: "Backend Engineer",
  company: "Northwind Systems",
  seniority: "mid",
  mustHave: ["Node.js", "TypeScript", "PostgreSQL", "REST APIs"],
  niceToHave: ["Docker", "Jest"],
  keywords: [
    { term: "Node.js", weight: 3, synonyms: ["Node", "NodeJS"] },
    { term: "TypeScript", weight: 3, synonyms: ["TS"] },
    { term: "PostgreSQL", weight: 3, synonyms: ["Postgres"] },
    { term: "REST APIs", weight: 3, synonyms: ["REST", "REST services"] },
    { term: "Express", weight: 2, synonyms: [] },
    { term: "SQL", weight: 2, synonyms: [] },
    { term: "Docker", weight: 2, synonyms: [] },
    { term: "Jest", weight: 1, synonyms: [] },
    { term: "React", weight: 1, synonyms: [] },
    { term: "Git", weight: 1, synonyms: [] },
  ],
  responsibilities: ["Build and maintain backend services", "Own database schema changes"],
};

/** A JD the resume partly fits: real overlap, but missing must-haves. */
export const partialFitAnalysis: JobAnalysis = {
  title: "Senior Platform Engineer",
  company: "Harbor Cloud",
  seniority: "senior",
  mustHave: ["Kubernetes", "Go", "Terraform", "Node.js", "PostgreSQL"],
  niceToHave: ["Prometheus"],
  keywords: [
    { term: "Kubernetes", weight: 3, synonyms: ["K8s"] },
    { term: "Go", weight: 3, synonyms: ["Golang"] },
    { term: "Terraform", weight: 3, synonyms: [] },
    { term: "Node.js", weight: 2, synonyms: ["Node"] },
    { term: "PostgreSQL", weight: 2, synonyms: ["Postgres"] },
    { term: "Docker", weight: 2, synonyms: [] },
    { term: "CI/CD", weight: 2, synonyms: ["continuous integration"] },
    { term: "Prometheus", weight: 1, synonyms: [] },
    { term: "TypeScript", weight: 1, synonyms: [] },
    { term: "Git", weight: 1, synonyms: [] },
  ],
  responsibilities: ["Run the Kubernetes platform", "Own infrastructure as code"],
};

/** A JD in a different profession entirely. */
export const outOfScopeAnalysis: JobAnalysis = {
  title: "Staff Nurse (ICU)",
  company: "Grace Memorial Hospital",
  seniority: "mid",
  mustHave: [
    "Registered Nurse licence",
    "ICU nursing experience",
    "Patient care",
    "Ventilator management",
    "BLS certification",
  ],
  niceToHave: ["ACLS certification"],
  keywords: [
    { term: "Registered Nurse", weight: 3, synonyms: ["RN"] },
    { term: "ICU", weight: 3, synonyms: ["intensive care"] },
    { term: "patient care", weight: 3, synonyms: [] },
    { term: "ventilator", weight: 3, synonyms: [] },
    { term: "BLS certification", weight: 3, synonyms: ["basic life support"] },
    { term: "medication administration", weight: 2, synonyms: [] },
    { term: "vital signs", weight: 2, synonyms: [] },
    { term: "triage", weight: 2, synonyms: [] },
    { term: "ACLS", weight: 1, synonyms: [] },
    { term: "charting", weight: 1, synonyms: [] },
  ],
  responsibilities: ["Care for critically ill patients", "Administer medication"],
};
