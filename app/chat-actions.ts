"use server";

import { answerChat, type ChatTurn, type ChatResult } from "@/lib/chat";

export async function chat(history: ChatTurn[]): Promise<ChatResult> {
  try {
    return await answerChat(history, "germany");
  } catch {
    return {
      answer: "Sorry, I hit an error there. Try again, or book a short call and we'll answer it directly.",
      sources: [],
      suggestCall: true,
    };
  }
}
