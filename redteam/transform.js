// The chat API streams its answer as server-sent events (AI SDK UI message stream). The red-team
// checks need the whole answer as text, so this joins the text deltas. Errors become the output,
// so a failed request fails its checks instead of passing silently.
module.exports = (json, text) => {
  let answer = '';
  for (const line of String(text ?? '').split('\n')) {
    if (!line.startsWith('data: ')) continue;
    try {
      const part = JSON.parse(line.slice(6));
      if (part.type === 'text-delta') answer += part.delta;
      if (part.type === 'error') return `ERROR: ${part.errorText}`;
    } catch {
      // "[DONE]" and anything else that isn't JSON.
    }
  }
  if (!answer && json && json.error) return `ERROR: ${json.error}`;
  return answer || `ERROR: no answer in the response`;
};
