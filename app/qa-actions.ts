"use server";

import { insertQuestion } from "@/lib/db";

/** A visitor submits a question on a guide. Stored as pending for the operator to answer. */
export async function submitQuestion(input: {
  corridor: string;
  unitSlug: string;
  question: string;
  email: string;
}): Promise<{ ok: boolean; message: string }> {
  if (input.question.trim().length < 8) return { ok: false, message: "Add a bit more detail to your question." };
  try {
    await insertQuestion({
      corridor: input.corridor,
      unitSlug: input.unitSlug,
      question: input.question.trim().slice(0, 1000),
      email: input.email.trim().slice(0, 200),
    });
    return { ok: true, message: "Thanks. We'll answer and, if useful to others, add it here." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not submit." };
  }
}
