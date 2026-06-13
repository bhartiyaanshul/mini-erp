// Mirror of backend app/core/validation.py::validate_strong_password so the
// signup/user forms can validate live and the "Suggest" button generates a
// password that satisfies every rule.

export interface PasswordRule {
  key: string;
  label: string;
  test: (pw: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { key: "len", label: "At least 8 characters", test: (pw) => pw.length >= 8 },
  { key: "lower", label: "A lowercase letter", test: (pw) => /[a-z]/.test(pw) },
  { key: "upper", label: "An uppercase letter", test: (pw) => /[A-Z]/.test(pw) },
  { key: "digit", label: "A number", test: (pw) => /[0-9]/.test(pw) },
  { key: "special", label: "A special character", test: (pw) => /[!@#$%^&*()_+\-=[\]{};:'",.<>/?\\|`~]/.test(pw) },
  { key: "nospace", label: "No spaces", test: (pw) => pw.length > 0 && !/\s/.test(pw) },
];

export function passwordRuleStatus(pw: string): { rule: PasswordRule; ok: boolean }[] {
  return PASSWORD_RULES.map((rule) => ({ rule, ok: rule.test(pw) }));
}

export function isStrongPassword(pw: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(pw));
}

const LOWER = "abcdefghijkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SPECIAL = "!@#$%^&*?-_+=";

function pick(set: string): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return set[arr[0] % set.length];
}

/** Generate a strong 14-char password guaranteed to satisfy every rule. */
export function suggestStrongPassword(): string {
  const all = LOWER + UPPER + DIGITS + SPECIAL;
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SPECIAL)];
  while (chars.length < 14) chars.push(pick(all));
  // Fisher–Yates shuffle so the guaranteed chars aren't always in front.
  for (let i = chars.length - 1; i > 0; i--) {
    const r = new Uint32Array(1);
    crypto.getRandomValues(r);
    const j = r[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export const USERNAME_MIN = 6;
export const USERNAME_MAX = 12;

export function usernameError(value: string): string | null {
  const v = value.trim();
  if (v.length < USERNAME_MIN || v.length > USERNAME_MAX)
    return `Username must be ${USERNAME_MIN}-${USERNAME_MAX} characters.`;
  if (!/^[A-Za-z0-9]+$/.test(v)) return "Username must be letters and numbers only.";
  return null;
}
