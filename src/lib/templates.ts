/**
 * Orbit Template System
 * 
 * Handles message templates with variable replacement for SMS and Email.
 * Variables use {{variable_name}} syntax and are replaced with contact data.
 */

// Available template variables
export const TEMPLATE_VARIABLES = {
  // Contact info
  first_name: 'Contact first name',
  last_name: 'Contact last name',
  full_name: 'Contact full name',
  email: 'Contact email address',
  phone: 'Contact phone number',
  address: 'Street address',
  city: 'City',
  state: 'State',
  zip_code: 'ZIP code',
  full_address: 'Complete address',
  
  // Claim info
  carrier: 'Insurance carrier',
  date_of_loss: 'Date of loss',
  policy_number: 'Policy number',
  claim_number: 'Claim number',
  
  // Quote info
  quote_type: 'Type of quote/work',
  
  // User info
  user_name: 'Your name',
  user_email: 'Your email',
  user_phone: 'Your phone',
  
  // Dates
  today: "Today's date",
  appointment_date: 'Scheduled appointment date',
  preferred_date: 'Preferred inspection date (user selected)',
} as const;

export type TemplateVariable = keyof typeof TEMPLATE_VARIABLES;

// Template context with all possible values
export interface TemplateContext {
  contact: {
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
    carrier?: string | null;
    dateOfLoss?: Date | null;
    policyNumber?: string | null;
    claimNumber?: string | null;
    quoteType?: string | null;
  };
  user?: {
    fullName: string;
    email: string;
    phone?: string | null;
  };
  appointmentDate?: Date;
  preferredDate?: Date;
}

/**
 * Parse a template and replace all variables with actual values
 */
export function parseTemplate(template: string, context: TemplateContext): string {
  const { contact, user, appointmentDate, preferredDate } = context;
  
  // Build full address
  const addressParts = [
    contact.address,
    contact.city,
    contact.state,
    contact.zipCode,
  ].filter(Boolean);
  const fullAddress = addressParts.join(', ');
  
  // Check if a date is tomorrow
  const isTomorrow = (date: Date) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return date.toDateString() === tomorrow.toDateString();
  };
  
  // Format dates (no year, "tomorrow" if applicable)
  const formatDate = (date: Date | null | undefined) => {
    if (!date) return '';
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  };
  
  // Format preferred date with "tomorrow" logic
  const formatPreferredDate = (date: Date | null | undefined) => {
    if (!date) return '';
    if (isTomorrow(date)) {
      return `tomorrow (${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })})`;
    }
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  };
  
  // Variable replacements
  const replacements: Record<string, string> = {
    first_name: contact.firstName || '',
    last_name: contact.lastName || '',
    full_name: `${contact.firstName} ${contact.lastName}`.trim(),
    email: contact.email || '',
    phone: contact.phone || '',
    address: contact.address || '',
    city: contact.city || '',
    state: contact.state || '',
    zip_code: contact.zipCode || '',
    full_address: fullAddress,
    carrier: contact.carrier || '',
    date_of_loss: formatDate(contact.dateOfLoss),
    policy_number: contact.policyNumber || '',
    claim_number: contact.claimNumber || '',
    quote_type: contact.quoteType || '',
    user_name: user?.fullName || '',
    user_email: user?.email || '',
    user_phone: user?.phone || '',
    today: formatDate(new Date()),
    appointment_date: formatDate(appointmentDate),
    preferred_date: formatPreferredDate(preferredDate),
  };
  
  // Replace all {{variable}} patterns
  return template.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
    const value = replacements[variable];
    return value !== undefined ? value : match;
  });
}

/**
 * Extract all variables used in a template
 */
export function extractTemplateVariables(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
}

/**
 * Validate that all variables in a template are valid
 */
export function validateTemplateVariables(template: string): {
  valid: boolean;
  invalidVariables: string[];
} {
  const usedVariables = extractTemplateVariables(template);
  const validVariables = Object.keys(TEMPLATE_VARIABLES);
  const invalidVariables = usedVariables.filter(v => !validVariables.includes(v));
  
  return {
    valid: invalidVariables.length === 0,
    invalidVariables,
  };
}

/**
 * Get suggested variables for a template category
 */
export function getSuggestedVariables(category: string): TemplateVariable[] {
  const baseVariables: TemplateVariable[] = ['first_name', 'last_name', 'full_name'];
  
  switch (category) {
    case 'FIRST_MESSAGE':
      return [...baseVariables, 'address', 'preferred_date', 'user_name'];
    
    case 'FIRST_MESSAGE_FOLLOW_UP':
      return [...baseVariables, 'address', 'user_name'];
    
    case 'APPOINTMENT_REMINDER':
      return [...baseVariables, 'address', 'appointment_date', 'user_name', 'user_phone'];
    
    case 'QUOTE':
    case 'QUOTE_FOLLOW_UP':
      return [...baseVariables, 'address', 'quote_type', 'user_name', 'user_email'];
    
    case 'CLAIM_RECOMMENDATION':
    case 'CLAIM_REC_FOLLOW_UP':
      return [...baseVariables, 'address', 'carrier', 'date_of_loss', 'user_name', 'user_email'];
    
    case 'PA_AGREEMENT':
    case 'PA_FOLLOW_UP':
      return [...baseVariables, 'address', 'carrier', 'date_of_loss', 'policy_number', 'user_name'];
    
    case 'CLAIM_FOLLOW_UP':
      return [...baseVariables, 'carrier', 'claim_number', 'user_name'];
    
    case 'SEASONAL':
      return [...baseVariables, 'address', 'user_name'];
    
    default:
      return baseVariables;
  }
}

// Default templates for each category
export const DEFAULT_TEMPLATES = {
  FIRST_MESSAGE: {
    sms: `Hi {{first_name}}, this is {{user_name}} with [Your Company]. I wanted to reach out about your property at {{address}}. I'd love to schedule a free inspection to assess your roof. Would {{preferred_date}} work for you?`,
    email: null,
  },
  FIRST_MESSAGE_FOLLOW_UP: {
    sms: `Hi {{first_name}}, just following up on my message about scheduling a roof inspection at {{address}}. Would you have any availability this week?`,
    email: null,
  },
  APPOINTMENT_REMINDER: {
    sms: `Hi {{first_name}}, this is {{user_name}} confirming our appointment at {{address}} on {{appointment_date}}. Looking forward to meeting with you! If you need to reschedule, please call me at {{user_phone}}.`,
    email: {
      subject: 'Appointment Reminder - {{appointment_date}}',
      body: `Hi {{first_name}},

This is a friendly reminder about our scheduled appointment at {{address}} on {{appointment_date}}.

If you have any questions or need to reschedule, please don't hesitate to reach out.

See you soon!

{{user_name}}
{{user_phone}}`,
    },
  },
  QUOTE: {
    sms: null,
    email: {
      subject: 'Your Roof Quote - {{address}}',
      body: `Dear {{first_name}},

Thank you for the opportunity to inspect your property at {{address}}. Attached please find your quote for {{quote_type}}.

Please review the quote at your convenience and let me know if you have any questions.

Best regards,
{{user_name}}
{{user_email}}`,
    },
  },
  QUOTE_FOLLOW_UP: {
    sms: `Hi {{first_name}}, just checking in on the quote I sent for your roof at {{address}}. Do you have any questions I can help answer?`,
    email: {
      subject: 'Following Up - Your Roof Quote',
      body: `Hi {{first_name}},

I wanted to follow up on the quote I sent for {{quote_type}} at {{address}}. 

Please let me know if you have any questions or if there's anything else I can provide.

Best regards,
{{user_name}}`,
    },
  },
  CLAIM_RECOMMENDATION: {
    sms: null,
    email: {
      subject: 'Insurance Claim Recommendation - {{address}}',
      body: `Dear {{first_name}},

Following my inspection of your property at {{address}}, I'm recommending that you file a claim with {{carrier}} for the damage that occurred on {{date_of_loss}}.

Based on my assessment, you have significant damage that should be covered under your homeowner's insurance policy.

I'd be happy to assist you through the claims process. Please see the attached documentation.

Best regards,
{{user_name}}
{{user_email}}`,
    },
  },
  CLAIM_REC_FOLLOW_UP: {
    sms: `Hi {{first_name}}, following up on the claim recommendation I sent for your property. Have you had a chance to file with {{carrier}}?`,
    email: {
      subject: 'Following Up - Insurance Claim Recommendation',
      body: `Hi {{first_name}},

I wanted to follow up on the claim recommendation I sent regarding your property at {{address}}.

Have you had a chance to file a claim with {{carrier}}? I'm here to help if you have any questions about the process.

Best regards,
{{user_name}}`,
    },
  },
  PA_AGREEMENT: {
    sms: null,
    email: {
      subject: 'Public Adjuster Agreement - {{address}}',
      body: `Dear {{first_name}},

As discussed, I'm sending over the Public Adjuster agreement for your claim at {{address}} with {{carrier}}.

Please review the attached agreement, sign, and return at your earliest convenience so we can proceed with your claim.

Best regards,
{{user_name}}
{{user_email}}`,
    },
  },
  PA_FOLLOW_UP: {
    sms: `Hi {{first_name}}, just checking in on the PA agreement I sent. Have you had a chance to review and sign it?`,
    email: {
      subject: 'Following Up - PA Agreement',
      body: `Hi {{first_name}},

I wanted to follow up on the Public Adjuster agreement I sent for your property at {{address}}.

Have you had a chance to review and sign? Once we have the signed agreement, we can move forward with your claim with {{carrier}}.

Best regards,
{{user_name}}`,
    },
  },
  CLAIM_FOLLOW_UP: {
    sms: `Hi {{first_name}}, just checking in on your claim with {{carrier}}. Any updates from the adjuster?`,
    email: {
      subject: 'Claim Status Update - {{carrier}}',
      body: `Hi {{first_name}},

I wanted to check in on the status of your claim with {{carrier}} for your property at {{address}}.

Please let me know if you've received any updates from the adjuster or if there's anything you need from me.

Best regards,
{{user_name}}`,
    },
  },
  CARRIER_FOLLOW_UP: {
    sms: null,
    email: {
      subject: 'Claim #{{claim_number}} - {{full_name}} - Follow Up',
      body: `To Whom It May Concern,

I am writing to follow up on the above-referenced claim for the property located at {{full_address}}.

The insured, {{full_name}}, filed this claim with {{carrier}} regarding damage that occurred on {{date_of_loss}} (Policy #{{policy_number}}).

We respectfully request an update on the status of this claim. Please let us know if any additional documentation is needed.

Thank you for your prompt attention to this matter.

Regards,
{{user_name}}
{{user_email}}
{{user_phone}}`,
    },
  },
  SEASONAL: {
    sms: `Hi {{first_name}}, it's {{user_name}} reaching out about your property at {{address}}. As we head into the new season, I wanted to check if you're ready to move forward with your roof project. Give me a call when you have a chance!`,
    email: {
      subject: 'Spring Check-In - {{address}}',
      body: `Hi {{first_name}},

I hope this finds you well! As we head into spring, I wanted to reach out about your property at {{address}}.

When we last spoke, you mentioned wanting to wait until the season changed. I'd love to reconnect and discuss your roofing needs when you're ready.

Best regards,
{{user_name}}
{{user_email}}`,
    },
  },
  GENERAL: {
    sms: `Hi {{first_name}}, this is {{user_name}}. Just wanted to reach out regarding your property at {{address}}. Please give me a call when you have a chance.`,
    email: null,
  },
} as const;

