import type { Metadata } from "next";
import { redirect } from "next/navigation";

import OnboardingFlow from "@/components/OnboardingFlow";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Set up your household | TwoCents" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.householdId) redirect("/");
  return <OnboardingFlow />;
}
