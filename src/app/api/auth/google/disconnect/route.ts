import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { disconnectGoogle } from "@/lib/google-oauth";
import prisma from "@/lib/prisma";

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's active organization
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { activeOrganizationId: true },
    });

    let membership;
    if (dbUser?.activeOrganizationId) {
      membership = await prisma.organizationMember.findFirst({
        where: { 
          userId: user.id,
          organizationId: dbUser.activeOrganizationId,
        },
      });
    }

    if (!membership) {
      membership = await prisma.organizationMember.findFirst({
        where: { userId: user.id },
        orderBy: { joinedAt: "asc" },
      });
    }

    if (!membership) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    await disconnectGoogle(membership.organizationId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error disconnecting Google:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

