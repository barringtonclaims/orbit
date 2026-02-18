import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";

/**
 * GET /api/josh/drafts - Fetch all pending drafts for the current user
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const drafts = await prisma.joshDraft.findMany({
      where: {
        userId: user.id,
        status: { in: ["pending", "queued", "composing"] },
      },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            carrier: true,
            carrierId: true,
            claimNumber: true,
            policyNumber: true,
            adjusterEmail: true,
            carrierRef: {
              select: {
                id: true,
                name: true,
                unifiedEmail: true,
                emailType: true,
                requiresClaimInSubject: true,
                subjectFormat: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ drafts });
  } catch (error) {
    console.error("Error fetching drafts:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/josh/drafts - Update a draft (edit body, subject, channel, or discard)
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, body, subject, channel, status } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "Draft ID required" }, { status: 400 });
    }

    const draft = await prisma.joshDraft.update({
      where: { id, userId: user.id },
      data: {
        ...(body !== undefined && { body }),
        ...(subject !== undefined && { subject }),
        ...(channel !== undefined && { channel }),
        ...(status !== undefined && { status }),
      },
    });

    return NextResponse.json({ draft });
  } catch (error) {
    console.error("Error updating draft:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
