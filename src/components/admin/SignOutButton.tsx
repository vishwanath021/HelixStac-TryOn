"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button className="btn ghost px-0" type="button" onClick={() => void signOut({ callbackUrl: "/" })}>
      Sign out
    </button>
  );
}
