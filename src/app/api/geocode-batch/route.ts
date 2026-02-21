import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function geocodeAddress(
  address?: string | null,
  city?: string | null,
  state?: string | null,
  zipCode?: string | null
): Promise<{ lat: number; lng: number } | null> {
  const parts = [address, city, state, zipCode].filter(Boolean);
  if (parts.length === 0) return null;

  try {
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set("q", parts.join(", "));
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "us");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "RelayCRM/1.0" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (isNaN(lat) || isNaN(lng)) return null;

    return { lat, lng };
  } catch {
    return null;
  }
}

function sseEvent(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { activeOrganizationId: true },
  });

  let membership;
  if (dbUser?.activeOrganizationId) {
    membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id, organizationId: dbUser.activeOrganizationId },
    });
  }
  if (!membership) {
    membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
      orderBy: { joinedAt: "asc" },
    });
  }
  if (!membership) {
    return new Response("No organization found", { status: 400 });
  }

  const orgId = membership.organizationId;

  const [contacts, totalContacts, alreadyGeocoded] = await Promise.all([
    prisma.contact.findMany({
      where: {
        organizationId: orgId,
        latitude: null,
        OR: [
          { address: { not: null } },
          { city: { not: null } },
          { zipCode: { not: null } },
        ],
      },
      select: {
        id: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
      },
    }),
    prisma.contact.count({ where: { organizationId: orgId } }),
    prisma.contact.count({
      where: { organizationId: orgId, latitude: { not: null } },
    }),
  ]);

  const total = contacts.length;
  const noAddressCount = totalContacts - alreadyGeocoded - total;

  const stream = new ReadableStream({
    async start(controller) {
      const encode = (data: object) =>
        new TextEncoder().encode(sseEvent(data));

      controller.enqueue(
        encode({
          type: "start",
          total,
          orgId,
          totalContacts,
          alreadyGeocoded,
          noAddressCount,
        })
      );

      let geocoded = 0;
      let failed = 0;

      for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i];

        const result = await geocodeAddress(
          contact.address,
          contact.city,
          contact.state,
          contact.zipCode
        );

        if (result) {
          await prisma.contact.update({
            where: { id: contact.id },
            data: { latitude: result.lat, longitude: result.lng },
          });
          geocoded++;
        } else {
          failed++;
        }

        controller.enqueue(
          encode({
            type: "progress",
            current: i + 1,
            total,
            geocoded,
            failed,
          })
        );

        // Nominatim rate limit: max 1 request/second
        if (i < contacts.length - 1) {
          await sleep(1100);
        }
      }

      controller.enqueue(
        encode({ type: "done", total, geocoded, failed })
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
