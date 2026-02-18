"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

interface GeoResult {
  lat: number;
  lng: number;
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function geocodeAddress(
  address?: string | null,
  city?: string | null,
  state?: string | null,
  zipCode?: string | null
): Promise<GeoResult | null> {
  const parts = [address, city, state, zipCode].filter(Boolean);
  if (parts.length === 0) return null;

  const q = parts.join(", ");

  try {
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "us");

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "RelayCRM/1.0" },
    });

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

export async function batchGeocodeContacts(): Promise<{
  total: number;
  geocoded: number;
  failed: number;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { total: 0, geocoded: 0, failed: 0, error: "Unauthorized" };
  }

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
    return { total: 0, geocoded: 0, failed: 0, error: "No organization" };
  }

  const contacts = await prisma.contact.findMany({
    where: {
      organizationId: membership.organizationId,
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
  });

  let geocoded = 0;
  let failed = 0;

  for (const contact of contacts) {
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

    // Nominatim rate limit: 1 request/second
    await sleep(1100);
  }

  return { total: contacts.length, geocoded, failed };
}
