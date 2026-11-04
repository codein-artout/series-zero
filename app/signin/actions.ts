"use server";
import { signIn } from "@/auth";
import { z } from "zod";

const next = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v : "/floor";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/floor";
};

export async function guestSignIn(fd: FormData) {
  await signIn("guest", { redirectTo: next(fd.get("next")) });
}
export async function demoSignIn(fd: FormData) {
  await signIn("demo", { redirectTo: next(fd.get("next")) });
}
export async function emailSignIn(fd: FormData) {
  const email = z.string().email().max(200).safeParse(fd.get("email"));
  if (!email.success) return;
  await signIn("email", { email: email.data, redirectTo: next(fd.get("next")) });
}
