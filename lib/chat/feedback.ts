// Thumbs-down reasons (overview §7.12): stored key → label. No imports, so the chat page can use it.
export const FEEDBACK_REASONS = {
  wrong: 'Wrong',
  incomplete: 'Incomplete',
  did_not_answer: "Didn't answer my question",
  hard_to_understand: 'Hard to understand',
} as const;

export type FeedbackReason = keyof typeof FEEDBACK_REASONS;
