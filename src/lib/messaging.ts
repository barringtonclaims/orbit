/**
 * Orbit Messaging Utilities
 * 
 * Helpers for composing SMS and Email messages that open in native apps.
 * Uses URL schemes to pre-fill messages in the user's device.
 */

/**
 * Compose an SMS URL that opens the native messaging app
 * Works on both iOS and Android
 */
export function composeSMSUrl(phone: string, message: string): string {
  // Clean phone number - remove non-digits except leading +
  const cleanPhone = phone.replace(/[^\d+]/g, '');
  
  // Encode message for URL
  const encodedMessage = encodeURIComponent(message);
  
  // iOS uses &body= while Android uses ?body=
  // Using sms: scheme with body parameter works on both
  // iOS 8+ and Android both support this format
  return `sms:${cleanPhone}?body=${encodedMessage}`;
}

/**
 * Compose a mailto URL that opens the native email app
 */
export function composeEmailUrl(
  email: string, 
  subject: string, 
  body: string,
  options?: {
    cc?: string;
    bcc?: string;
  }
): string {
  const params: string[] = [];
  
  if (subject) {
    params.push(`subject=${encodeURIComponent(subject)}`);
  }
  
  if (body) {
    params.push(`body=${encodeURIComponent(body)}`);
  }
  
  if (options?.cc) {
    params.push(`cc=${encodeURIComponent(options.cc)}`);
  }
  
  if (options?.bcc) {
    params.push(`bcc=${encodeURIComponent(options.bcc)}`);
  }
  
  const queryString = params.length > 0 ? `?${params.join('&')}` : '';
  return `mailto:${email}${queryString}`;
}

/**
 * Compose a tel URL for phone calls
 */
export function composePhoneUrl(phone: string): string {
  const cleanPhone = phone.replace(/[^\d+]/g, '');
  return `tel:${cleanPhone}`;
}

/**
 * Format a phone number for display
 * Converts +15551234567 to (555) 123-4567
 */
export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  
  // Handle US phone numbers
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  
  // Handle +1 prefix
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  
  // Return original if not a standard format
  return phone;
}

/**
 * Validate a phone number (basic validation)
 */
export function isValidPhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 15;
}

/**
 * Validate an email address (basic validation)
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Open native compose with message
 * Returns true if successful, false if missing required info
 */
export function openNativeCompose(
  type: 'sms' | 'email',
  recipient: string | null | undefined,
  message: string,
  subject?: string
): boolean {
  if (!recipient) {
    return false;
  }
  
  if (type === 'sms') {
    if (!isValidPhone(recipient)) {
      return false;
    }
    window.location.href = composeSMSUrl(recipient, message);
    return true;
  }
  
  if (type === 'email') {
    if (!isValidEmail(recipient)) {
      return false;
    }
    window.location.href = composeEmailUrl(recipient, subject || '', message);
    return true;
  }
  
  return false;
}

