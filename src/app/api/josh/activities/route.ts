import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUnreadActivities } from "@/lib/josh/email-processor";
import { getOrganization } from "@/lib/actions/organizations";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: org } = await getOrganization();
    if (!org) {
      return NextResponse.json({ activities: [], count: 0 });
    }

    const result = await getUnreadActivities(user.id, org.id);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching Josh activities:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

