export const DEMO_PASSWORDS = new Set(["DemoSalon#2026", "DemoStaff#2026", "SuperAdmin#2026"]);

export function passwordProblem(password: string) {
  if (password.length < 12 || password.length > 200) return "Use a password of at least 12 characters.";
  if (DEMO_PASSWORDS.has(password)) return "Choose a password that is not a demo login.";
  return "";
}
