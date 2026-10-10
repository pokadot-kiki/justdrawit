// One entry per distinct real prediction; the server remains responsible for inference and scoring.
export function appendSoloGuess(history, event, roundId, phase) {
  if (phase !== "playing" || event?.roundId !== roundId || !["model", "claude"].includes(event?.source)) return history;
  const text = typeof event.guess === "string" ? event.guess.trim() : "";
  if (!text) return history;
  const correct = event.correct === true;
  const last = history[history.length - 1];
  if (last?.text === text && last.correct === correct) return history;
  return [...history, { text, correct }];
}
