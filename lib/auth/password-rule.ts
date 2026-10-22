// The password rule as text for the forms. Kept apart from ./schemas so the browser doesn't load
// zod, whose start-up probe for eval would show up as a (harmless) CSP violation.
export const PASSWORD_MIN = 12;
export const PASSWORD_RULE = `at least ${PASSWORD_MIN} characters, with upper and lower case letters and a digit`;
