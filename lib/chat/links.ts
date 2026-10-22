// Links an answer may carry (overview §10.0, defense in depth: the AI layer's output check). Every
// source and contact page is on kenya-airways.com, so a link anywhere else came from somewhere it
// shouldn't (an injected instruction or a model slip) and is shown as plain text instead.
const ALLOWED_HOST = 'kenya-airways.com';

export function safeAnswerHref(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
    return host === ALLOWED_HOST || host.endsWith(`.${ALLOWED_HOST}`) ? parsed.href : '';
  } catch {
    return '';
  }
}
