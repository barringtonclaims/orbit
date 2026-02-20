import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const companyName = searchParams.get("company") || "";
    const contactName = searchParams.get("contact") || "";

    const resourceContact = await prisma.resourceContact.findFirst({
      where: {
        name: contactName,
        ...(companyName ? { company: { name: companyName } } : {}),
      },
      select: {
        name: true,
        phone: true,
        email: true,
        role: true,
        company: { select: { name: true, phone: true, email: true } },
      },
    });

    if (!resourceContact) {
      return NextResponse.json({ phone: null, email: null });
    }

    return NextResponse.json({
      name: resourceContact.name,
      phone: resourceContact.phone || resourceContact.company.phone,
      email: resourceContact.email || resourceContact.company.email,
      role: resourceContact.role,
      companyName: resourceContact.company.name,
    });
  } catch (error) {
    console.error("Resource lookup error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
