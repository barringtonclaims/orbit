/**
 * AccuLynx Email Parser
 * 
 * Parses AccuLynx notification emails to extract contact information.
 * Handles both direct AccuLynx emails and forwarded AccuLynx emails.
 * 
 * Supported formats:
 * - "Lead Assigned: LastName, FirstName" notifications
 * - "New Lead" notifications
 * - Forwarded AccuLynx emails
 */

import { ParsedEmail } from "@/lib/gmail";

export interface AccuLynxLead {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  source?: string;
  notes?: string;
  jobPriority?: string;
}

// Patterns that indicate an AccuLynx email
const ACCULYNX_INDICATORS = [
  "acculynx",
  "new lead notification",
  "a new lead has been added",
  "lead information",
  "lead assigned:",
  "you have been assigned as the primary owner",
  "customer contact information:",
];

/**
 * Check if an email is from AccuLynx (or is a forwarded AccuLynx email)
 */
export function isAccuLynxEmail(email: ParsedEmail): boolean {
  const fromLower = email.from.email.toLowerCase();
  const subjectLower = email.subject.toLowerCase();
  const bodyLower = email.body.toLowerCase();

  // Check sender domain (direct AccuLynx emails)
  if (fromLower.includes("acculynx")) {
    return true;
  }

  // Check subject for AccuLynx patterns (handles forwarded emails)
  if (subjectLower.includes("lead assigned:") || subjectLower.includes("fwd: lead assigned:")) {
    return true;
  }

  // Check body for AccuLynx indicators (handles forwarded emails)
  const combinedText = `${subjectLower} ${bodyLower}`;
  return ACCULYNX_INDICATORS.some(indicator => combinedText.includes(indicator));
}

/**
 * Check if this is a new lead notification (vs other AccuLynx emails like status updates)
 */
export function isNewLeadNotification(email: ParsedEmail): boolean {
  const subjectLower = email.subject.toLowerCase();
  const bodyLower = email.body.toLowerCase();

  const newLeadIndicators = [
    "new lead",
    "lead notification",
    "lead has been added",
    "lead assigned:",
    "new customer",
    "new prospect",
    "you have been assigned as the primary owner",
  ];

  return newLeadIndicators.some(
    indicator => subjectLower.includes(indicator) || bodyLower.includes(indicator)
  );
}

/**
 * Parse an AccuLynx email to extract contact information
 * Handles the "Lead Assigned" format:
 * 
 * Subject: Lead Assigned: O'Connor, Abigal 18247
 * Body contains:
 *   Customer contact information:
 *   O'Connor, Abigal
 *   Job: N/A
 *   UNKNOWN,
 *   Geneva, IL, 60134
 *   (331) 228-9008 Ext: ok to Text - mobile - Primary
 *   abigailoconnor9008@gmail.com - Primary
 *   
 *   Lead information:
 *   Source: Google Ad Words
 *   
 *   Lead Notes:
 *   [notes text]
 */
export function parseAccuLynxEmail(email: ParsedEmail): AccuLynxLead | null {
  // For forwarded emails, extract only the AccuLynx content
  // This prevents matching the forwarder's signature/info
  const body = extractForwardedAccuLynxContent(email.body);
  const subject = extractForwardedSubject(email.subject);

  try {
    const lead: Partial<AccuLynxLead> = {};

    // === Method 1: Parse from "Lead Assigned:" subject line ===
    // Format: "Lead Assigned: LastName, FirstName 12345" or "Fwd: Lead Assigned: ..."
    const subjectMatch = subject.match(/Lead Assigned:\s*([^,]+),\s*([^\d]+)/i);
    if (subjectMatch) {
      lead.lastName = subjectMatch[1].trim();
      lead.firstName = subjectMatch[2].trim();
    }

    // === Method 2: Parse from "Customer contact information:" section ===
    // This section has a specific format in AccuLynx emails
    const customerInfoMatch = body.match(/Customer contact information:\s*\n([^\n]+)/i);
    if (customerInfoMatch) {
      const nameLine = customerInfoMatch[1].trim();
      // Format is typically "LastName, FirstName" or just "FirstName LastName"
      if (nameLine.includes(',')) {
        const [lastName, firstName] = nameLine.split(',').map(s => s.trim());
        if (!lead.firstName) lead.firstName = firstName;
        if (!lead.lastName) lead.lastName = lastName;
      } else {
        const nameParts = nameLine.split(/\s+/);
        if (nameParts.length >= 2 && !lead.firstName) {
          lead.firstName = nameParts[0];
          lead.lastName = nameParts.slice(1).join(' ');
        }
      }
    }

    // === Extract phone number ===
    // Format: "(331) 228-9008 Ext: ok to Text - mobile - Primary"
    // Or: "Phone: (555) 123-4567"
    const phonePatterns = [
      /\((\d{3})\)\s*(\d{3})[-.]?(\d{4})/,  // (331) 228-9008
      /(\d{3})[-.](\d{3})[-.](\d{4})/,       // 331-228-9008
      /phone:\s*([\d\s\-()\.]+)/i,           // Phone: 331-228-9008
    ];
    
    for (const pattern of phonePatterns) {
      const phoneMatch = body.match(pattern);
      if (phoneMatch) {
        if (phoneMatch[1] && phoneMatch[2] && phoneMatch[3]) {
          lead.phone = `(${phoneMatch[1]}) ${phoneMatch[2]}-${phoneMatch[3]}`;
        } else if (phoneMatch[1]) {
          // Clean and format
          const digits = phoneMatch[1].replace(/\D/g, '');
          if (digits.length === 10) {
            lead.phone = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
          }
        }
        break;
      }
    }

    // === Extract email ===
    // Look for email addresses, but exclude AccuLynx system emails
    const emailRegex = /\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,})\b/g;
    const allEmails = body.match(emailRegex) || [];
    
    for (const foundEmail of allEmails) {
      const lowerEmail = foundEmail.toLowerCase();
      // Skip AccuLynx system emails and the sender's email
      if (!lowerEmail.includes('acculynx') && 
          !lowerEmail.includes('noreply') &&
          !lowerEmail.includes('do-not-reply') &&
          lowerEmail !== email.from.email.toLowerCase()) {
        lead.email = foundEmail;
        break;
      }
    }

    // === Extract city, state, zip ===
    // Format: "Geneva, IL, 60134" or "Geneva, IL 60134"
    const cityStateZipMatch = body.match(/([A-Za-z\s]+),\s*([A-Z]{2}),?\s*(\d{5}(?:-\d{4})?)/);
    if (cityStateZipMatch) {
      lead.city = cityStateZipMatch[1].trim();
      lead.state = cityStateZipMatch[2];
      lead.zipCode = cityStateZipMatch[3];
    }

    // === Extract address ===
    // Look for street address patterns
    const addressPatterns = [
      /(?:address|street):\s*([^\n\r]+)/i,
      /(\d+\s+[A-Za-z0-9\s]+(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Way|Ct|Court|Pl|Place)[.,]?)/i,
    ];
    for (const pattern of addressPatterns) {
      const addressMatch = body.match(pattern);
      if (addressMatch) {
        const addr = addressMatch[1].trim();
        // Don't use if it's clearly not an address (too short, or is actually city/state)
        if (addr.length > 5 && !addr.match(/^[A-Z]{2}$/)) {
          lead.address = addr;
          break;
        }
      }
    }

    // === Extract source ===
    // Format: "Source: Google Ad Words"
    const sourceMatch = body.match(/(?:source|lead\s*source):\s*([^\n\r]+)/i);
    if (sourceMatch) {
      lead.source = sourceMatch[1].trim();
    }

    // === Extract job priority ===
    const priorityMatch = body.match(/job\s*priority:\s*([^\n\r]+)/i);
    if (priorityMatch) {
      lead.jobPriority = priorityMatch[1].trim();
    }

    // === Extract lead notes ===
    // Format: "Lead Notes:\n[multiline notes]"
    const notesMatch = body.match(/Lead Notes:\s*\n([\s\S]*?)(?=\n\n|Please click here|$)/i);
    if (notesMatch) {
      lead.notes = notesMatch[1].trim();
    }

    // === Fallback: Try generic name patterns ===
    if (!lead.firstName && !lead.lastName) {
      const genericNameMatch = body.match(/(?:name|customer|homeowner|contact):\s*([^\n\r]+)/i);
      if (genericNameMatch) {
        const fullName = genericNameMatch[1].trim();
        if (fullName.includes(',')) {
          const [lastName, firstName] = fullName.split(',').map(s => s.trim());
          lead.firstName = firstName;
          lead.lastName = lastName;
        } else {
          const nameParts = fullName.split(/\s+/);
          if (nameParts.length >= 2) {
            lead.firstName = nameParts[0];
            lead.lastName = nameParts.slice(1).join(' ');
          } else if (nameParts.length === 1) {
            lead.firstName = nameParts[0];
          }
        }
      }
    }

    // Validate that we have at least a name or contact info
    if (!lead.firstName && !lead.lastName && !lead.email && !lead.phone) {
      console.warn("Could not extract sufficient info from AccuLynx email");
      return null;
    }

    return {
      firstName: lead.firstName || "Unknown",
      lastName: lead.lastName || "",
      email: lead.email,
      phone: lead.phone,
      address: lead.address,
      city: lead.city,
      state: lead.state,
      zipCode: lead.zipCode,
      source: lead.source || "AccuLynx",
      notes: lead.notes,
      jobPriority: lead.jobPriority,
    };
  } catch (error) {
    console.error("Error parsing AccuLynx email:", error);
    return null;
  }
}

/**
 * Extract AccuLynx content from a forwarded email
 * Looks for the original AccuLynx email content within a forwarded message
 * 
 * This is critical for forwarded emails where the user's signature
 * appears BEFORE the actual AccuLynx lead information.
 */
export function extractForwardedAccuLynxContent(body: string): string {
  // Common forward markers - check these in order of specificity
  const forwardMarkers = [
    // iOS/macOS Mail format
    /Begin forwarded message:\s*\n/i,
    // Gmail format
    /---------- Forwarded message ---------\s*\n/i,
    // Look for the AccuLynx From: line directly
    /From:\s*AccuLynx/i,
    // Look for the company header that appears in AccuLynx emails
    /You have been assigned as the Primary Owner/i,
    // Look for customer contact section
    /Customer contact information:/i,
  ];

  for (const marker of forwardMarkers) {
    const match = body.match(marker);
    if (match && match.index !== undefined) {
      // Return everything from the forward marker onwards
      return body.slice(match.index);
    }
  }

  return body;
}

/**
 * Extract the original subject from a forwarded email subject
 * Removes "Fwd:", "Fw:", "Re:" prefixes
 */
function extractForwardedSubject(subject: string): string {
  return subject.replace(/^(?:Fwd?|Re):\s*/gi, "").trim();
}
