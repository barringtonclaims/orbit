import { addDays, getDay, startOfDay, isBefore, isEqual } from 'date-fns'

/**
 * Orbit Task Scheduling Logic
 * 
 * Configurable "Office Days" (for tasks) and "Inspection Days" (for appointments).
 * Default Office Days: Mon (1), Wed (3), Fri (5)
 * Default Inspection Days: Tue (2), Thu (4)
 */

const DEFAULT_OFFICE_DAYS = [1, 3, 5];
const DEFAULT_INSPECTION_DAYS = [2, 4];

/**
 * Get the next date that matches one of the allowed days of the week.
 * If today matches, returns today (unless skipToday is true).
 * 
 * @param fromDate Starting date
 * @param allowedDays Array of integers 0-6 (0=Sunday, 1=Monday...)
 * @param skipToday If true, start checking from tomorrow
 */
export function getNextAvailableDay(
  fromDate: Date = new Date(), 
  allowedDays: number[] = DEFAULT_OFFICE_DAYS,
  skipToday: boolean = true
): Date {
  let current = startOfDay(fromDate);
  
  if (skipToday) {
    current = addDays(current, 1);
  }

  // Look ahead up to 7 days to find the next match
  for (let i = 0; i < 7; i++) {
    const dayOfWeek = getDay(current);
    if (allowedDays.includes(dayOfWeek)) {
      return current;
    }
    current = addDays(current, 1);
  }

  return current; // Fallback (should theoretically always find one in 7 days)
}

/**
 * Legacy support for "Next M/W/F" - now just an alias for getNextOfficeDay
 */
export function getNextMWFDate(fromDate: Date = new Date()): Date {
  return getNextAvailableDay(fromDate, DEFAULT_OFFICE_DAYS, true);
}

/**
 * Get next office day (for tasks)
 */
export function getNextOfficeDay(
  fromDate: Date = new Date(), 
  officeDays: number[] = DEFAULT_OFFICE_DAYS
): Date {
  return getNextAvailableDay(fromDate, officeDays, true);
}

/**
 * Get next inspection day (for appointments)
 */
export function getNextInspectionDay(
  fromDate: Date = new Date(), 
  inspectionDays: number[] = DEFAULT_INSPECTION_DAYS
): Date {
  // For inspections, we generally look for the next available slot, possibly including today if it's early enough?
  // Usually scheduling happens for the future, so skipToday=true is safe default.
  return getNextAvailableDay(fromDate, inspectionDays, true);
}

/**
 * Get all available dates within a range that match specific days
 */
export function getAvailableDatesInRange(
  startDate: Date, 
  endDate: Date,
  allowedDays: number[]
): Date[] {
  const dates: Date[] = []
  let current = startOfDay(startDate);
  
  // Align start date to first allowed day if needed (including today)
  if (!allowedDays.includes(getDay(current))) {
    current = getNextAvailableDay(current, allowedDays, false);
  }
  
  while (isBefore(current, endDate) || isEqual(current, endDate)) {
    if (allowedDays.includes(getDay(current))) {
      dates.push(current);
    }
    current = addDays(current, 1);
  }
  
  return dates;
}

/**
 * Generate task title based on contact name and task type
 */
export function generateTaskTitle(
  contactName: string, 
  taskType: 'SET_APPOINTMENT' | 'APPOINTMENT' | 'WRITE_QUOTE' | 'SEND_QUOTE' | 'FOLLOW_UP' | 'FIRST_MESSAGE' | 'CLAIM_RECOMMENDATION' | 'CUSTOM',
  appointmentDate?: Date
): string {
  const name = contactName.trim()
  
  switch (taskType) {
    case 'FIRST_MESSAGE':
      return `${name} - Send First Message`
    case 'SET_APPOINTMENT':
      return `${name} - Set Initial Inspection`
    case 'APPOINTMENT':
      if (appointmentDate) {
        const dateStr = appointmentDate.toLocaleDateString('en-US', { 
          weekday: 'short', 
          month: 'short', 
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        })
        return `${name} - Inspection: ${dateStr}`
      }
      return `${name} - Inspection Scheduled`
    case 'WRITE_QUOTE':
      return `${name} - Write Quote`
    case 'SEND_QUOTE':
      return `${name} - Send Quote`
    case 'CLAIM_RECOMMENDATION':
      return `${name} - Send Claim Recommendation`
    case 'FOLLOW_UP':
      return `${name} - Follow Up`
    default:
      return `${name} - Task`
  }
}
