import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function safeFilenamePart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/** Firstname_Lastname_Company_Role */
export function exportFilename(
  name: string,
  company: string | undefined,
  role: string | undefined,
  ext: "pdf" | "docx",
): string {
  const parts = [name, company, role]
    .map((p) => safeFilenamePart(p || ""))
    .filter(Boolean);
  return `${parts.join("_") || "resume"}.${ext}`;
}
