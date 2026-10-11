import { LoginForm } from "@/app/login/LoginForm";

export default function LoginPage() {
  return (
    <main className="px-4 py-16">
      <LoginForm defaultEmail={process.env.NODE_ENV === "production" ? "" : "owner@demo.helixstac.app"} />
    </main>
  );
}
