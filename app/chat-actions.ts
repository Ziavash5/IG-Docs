"use server";

import { insertLead } from "@/lib/db";
import { getActiveCorridor } from "@/lib/corridor";

/** Capture a lead from the chat funnel (name/email/company + the conversation). */
export async function saveLead(input: {
  name: string;
  email: string;
  company: string;
  question: string;
  transcript: string;
}): Promise<{ ok: boolean; message: string }> {
  if (!input.email.trim() || !input.name.trim()) {
    return { ok: false, message: "Please add your name and email." };
  }
  try {
    await insertLead({
      name: input.name.trim(),
      email: input.email.trim(),
      company: input.company.trim(),
      corridor: await getActiveCorridor(),
      question: input.question.slice(0, 1000),
      transcript: input.transcript.slice(0, 8000),
    });
    return { ok: true, message: "Thanks. The InterGest Canada team will follow up shortly." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save. Try again." };
  }
}
