import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { FloatingActionButton } from "@/components/layout/floating-action-button";
import { JoshChatBubble } from "@/components/josh/josh-chat-bubble";
import prisma from "@/lib/prisma";

// Force dynamic to prevent caching issues with organization switching
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    redirect("/login");
  }

  // Ensure user exists in database
  let dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      fullName: true,
      avatarUrl: true,
      activeOrganizationId: true,
    },
  });

  if (!dbUser) {
    dbUser = await prisma.user.create({
      data: {
        id: user.id,
        email: user.email!,
        fullName: user.user_metadata?.full_name || user.email!.split("@")[0],
        avatarUrl: user.user_metadata?.avatar_url || null,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        activeOrganizationId: true,
      },
    });
  }

  // Get organization membership - RESPECT activeOrganizationId
  let membership;
  
  // First try to get the active organization
  if (dbUser.activeOrganizationId) {
    membership = await prisma.organizationMember.findFirst({
      where: { 
        userId: user.id,
        organizationId: dbUser.activeOrganizationId,
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });
  }
  
  // Fall back to first organization if active one not found
  if (!membership) {
    membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });
  }

  const userData = {
    id: user.id,
    email: user.email || "",
    fullName: dbUser.fullName,
    avatarUrl: dbUser.avatarUrl,
  };

  const organization = membership
    ? {
        id: membership.organization.id,
        name: membership.organization.name,
        role: membership.role,
      }
    : null;

  return (
    <div className="min-h-screen bg-background">
      <Sidebar user={userData} organization={organization} />
      
      {/* Main Content */}
      <main className="md:pl-64 pt-16 md:pt-0 min-h-screen">
        <div className="container mx-auto p-4 md:p-6 max-w-7xl">
          {children}
        </div>
      </main>

      {/* Mobile FAB */}
      <FloatingActionButton />

      {/* Josh AI Chat Bubble */}
      <JoshChatBubble />
    </div>
  );
}
