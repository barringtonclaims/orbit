/**
 * Contact Matcher
 * 
 * Matches incoming emails to existing contacts in the database
 * by email address, phone number, or name similarity.
 */

import prisma from "@/lib/prisma";
import { ParsedEmail } from "@/lib/gmail";

export interface MatchResult {
  contactId: string;
  confidence: number;
  matchType: "email" | "phone" | "name" | "address";
}

// Known carrier email domains
const CARRIER_DOMAINS = [
  "statefarm.com",
  "allstate.com",
  "geico.com",
  "progressive.com",
  "usaa.com",
  "nationwide.com",
  "libertymutual.com",
  "travelers.com",
  "farmers.com",
  "americanfamily.com",
  "thehartford.com",
  "chubb.com",
  "erieinsurance.com",
  "auto-owners.com",
  "safeco.com",
  "hanover.com",
  "amica.com",
  "mercuryinsurance.com",
  "metlife.com",
  "aia.com",
];

// Internal/system email patterns to ignore
const INTERNAL_PATTERNS = [
  /noreply@/i,
  /no-reply@/i,
  /donotreply@/i,
  /mailer-daemon@/i,
  /postmaster@/i,
  /notifications@/i,
  /alerts@/i,
];

/**
 * Check if an email is from an insurance carrier
 */
export function isCarrierEmail(email: ParsedEmail): boolean {
  const fromDomain = email.from.email.split("@")[1]?.toLowerCase();
  return CARRIER_DOMAINS.some(domain => fromDomain?.includes(domain));
}

/**
 * Check if an email is internal/system email to skip
 */
export function isInternalEmail(email: ParsedEmail): boolean {
  return INTERNAL_PATTERNS.some(pattern => pattern.test(email.from.email));
}

/**
 * Find existing contacts that match the email sender
 */
export async function findMatchingContacts(
  organizationId: string,
  email: ParsedEmail
): Promise<MatchResult[]> {
  const matches: MatchResult[] = [];
  const senderEmail = email.from.email.toLowerCase();
  const senderName = email.from.name?.toLowerCase();

  // 1. Exact email match (highest confidence)
  const emailMatch = await prisma.contact.findFirst({
    where: {
      organizationId,
      email: {
        equals: senderEmail,
        mode: "insensitive",
      },
    },
  });

  if (emailMatch) {
    matches.push({
      contactId: emailMatch.id,
      confidence: 1.0,
      matchType: "email",
    });
    return matches; // Exact email match is definitive
  }

  // 2. Phone number match (extract phone from email body)
  const phoneInEmail = extractPhoneFromText(email.body);
  if (phoneInEmail) {
    const phoneMatch = await prisma.contact.findFirst({
      where: {
        organizationId,
        phone: {
          contains: phoneInEmail.replace(/\D/g, "").slice(-10),
        },
      },
    });

    if (phoneMatch) {
      matches.push({
        contactId: phoneMatch.id,
        confidence: 0.9,
        matchType: "phone",
      });
    }
  }

  // 3. Name match (lower confidence)
  if (senderName && senderName.length > 2) {
    const nameParts = senderName.split(/\s+/);
    
    // Try to match first and last name
    if (nameParts.length >= 2) {
      const firstName = nameParts[0];
      const lastName = nameParts[nameParts.length - 1];

      const nameMatch = await prisma.contact.findFirst({
        where: {
          organizationId,
          firstName: {
            equals: firstName,
            mode: "insensitive",
          },
          lastName: {
            equals: lastName,
            mode: "insensitive",
          },
        },
      });

      if (nameMatch) {
        matches.push({
          contactId: nameMatch.id,
          confidence: 0.7,
          matchType: "name",
        });
      }
    }
  }

  // 4. Address match (extract address from email, match against contacts)
  const addressInEmail = extractAddressFromText(email.body);
  if (addressInEmail) {
    // Normalize address for comparison
    const normalizedAddress = normalizeAddress(addressInEmail);
    
    const addressMatches = await prisma.contact.findMany({
      where: {
        organizationId,
        address: { not: null },
      },
      select: {
        id: true,
        address: true,
      },
    });

    for (const contact of addressMatches) {
      if (contact.address) {
        const contactNormalized = normalizeAddress(contact.address);
        const similarity = calculateAddressSimilarity(normalizedAddress, contactNormalized);
        
        if (similarity > 0.8) {
          matches.push({
            contactId: contact.id,
            confidence: similarity * 0.8, // Cap at 0.8 for address matches
            matchType: "address",
          });
        }
      }
    }
  }

  // Sort by confidence descending
  matches.sort((a, b) => b.confidence - a.confidence);

  return matches;
}

/**
 * Find contacts that might be related to a carrier email
 * (by matching the property address or claim number mentioned in the email)
 */
export async function findContactsForCarrierEmail(
  organizationId: string,
  email: ParsedEmail
): Promise<MatchResult[]> {
  const matches: MatchResult[] = [];
  const bodyLower = email.body.toLowerCase();

  // 1. Look for claim numbers
  const claimNumberMatch = email.body.match(/claim\s*(?:#|number|no\.?)?\s*[:=]?\s*([A-Z0-9-]+)/i);
  if (claimNumberMatch) {
    const claimNumber = claimNumberMatch[1];
    const claimMatch = await prisma.contact.findFirst({
      where: {
        organizationId,
        claimNumber: {
          equals: claimNumber,
          mode: "insensitive",
        },
      },
    });

    if (claimMatch) {
      matches.push({
        contactId: claimMatch.id,
        confidence: 0.95,
        matchType: "email", // Using email as a proxy for "reference match"
      });
      return matches;
    }
  }

  // 2. Look for policy numbers
  const policyNumberMatch = email.body.match(/policy\s*(?:#|number|no\.?)?\s*[:=]?\s*([A-Z0-9-]+)/i);
  if (policyNumberMatch) {
    const policyNumber = policyNumberMatch[1];
    const policyMatch = await prisma.contact.findFirst({
      where: {
        organizationId,
        policyNumber: {
          equals: policyNumber,
          mode: "insensitive",
        },
      },
    });

    if (policyMatch) {
      matches.push({
        contactId: policyMatch.id,
        confidence: 0.9,
        matchType: "email",
      });
      return matches;
    }
  }

  // 3. Try to match by address mentioned in the email
  const addressInEmail = extractAddressFromText(email.body);
  if (addressInEmail) {
    const normalizedAddress = normalizeAddress(addressInEmail);
    
    const addressMatches = await prisma.contact.findMany({
      where: {
        organizationId,
        address: { not: null },
        carrier: { not: null }, // Only look at contacts with carriers
      },
      select: {
        id: true,
        address: true,
      },
    });

    for (const contact of addressMatches) {
      if (contact.address) {
        const contactNormalized = normalizeAddress(contact.address);
        const similarity = calculateAddressSimilarity(normalizedAddress, contactNormalized);
        
        if (similarity > 0.7) {
          matches.push({
            contactId: contact.id,
            confidence: similarity * 0.85,
            matchType: "address",
          });
        }
      }
    }
  }

  // 4. Try to match by customer name mentioned in carrier email
  const customerNameMatch = email.body.match(/(?:insured|policyholder|customer|claimant)(?:'s)?\s*(?:name)?:\s*([^\n\r,]+)/i);
  if (customerNameMatch) {
    const nameParts = customerNameMatch[1].trim().split(/\s+/);
    if (nameParts.length >= 2) {
      const nameMatch = await prisma.contact.findFirst({
        where: {
          organizationId,
          firstName: {
            equals: nameParts[0],
            mode: "insensitive",
          },
          lastName: {
            equals: nameParts[nameParts.length - 1],
            mode: "insensitive",
          },
        },
      });

      if (nameMatch) {
        matches.push({
          contactId: nameMatch.id,
          confidence: 0.75,
          matchType: "name",
        });
      }
    }
  }

  matches.sort((a, b) => b.confidence - a.confidence);
  return matches;
}

/**
 * Extract phone number from text
 */
function extractPhoneFromText(text: string): string | null {
  const phoneMatch = text.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  return phoneMatch ? phoneMatch[0] : null;
}

/**
 * Extract address from text (basic implementation)
 */
function extractAddressFromText(text: string): string | null {
  // Look for common address patterns
  const addressPatterns = [
    /(?:address|property|location):\s*([^\n\r]+)/i,
    /(\d+\s+[A-Za-z\s]+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|boulevard|ct|court|way|pl|place)[^\n\r]*)/i,
  ];

  for (const pattern of addressPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Normalize an address for comparison
 */
function normalizeAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/\bstreet\b/g, "st")
    .replace(/\bavenue\b/g, "ave")
    .replace(/\broad\b/g, "rd")
    .replace(/\bdrive\b/g, "dr")
    .replace(/\blane\b/g, "ln")
    .replace(/\bboulevard\b/g, "blvd")
    .replace(/\bcourt\b/g, "ct")
    .replace(/\bplace\b/g, "pl")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calculate similarity between two addresses (0-1)
 */
function calculateAddressSimilarity(addr1: string, addr2: string): number {
  const words1 = addr1.split(" ");
  const words2 = addr2.split(" ");
  
  let matches = 0;
  for (const word of words1) {
    if (words2.includes(word)) {
      matches++;
    }
  }

  return matches / Math.max(words1.length, words2.length);
}

