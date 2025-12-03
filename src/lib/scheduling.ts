import { addDays, getDay, startOfDay, isBefore, isEqual, format } from 'date-fns'

/**
 * Orbit Task Scheduling Logic
 * 
 * Configurable "Office Days" (for tasks) and "Inspection Days" (for appointments).
 * Default Office Days: Mon (1), Wed (3), Fri (5)
 * Default Inspection Days: Tue (2), Thu (4)
 */

const DEFAULT_OFFICE_DAYS = [1, 3, 5]
const DEFAULT_INSPECTION_DAYS = [2, 4]

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
  let current = startOfDay(fromDate)
  
  if (skipToday) {
    current = addDays(current, 1)
  }

  // Look ahead up to 7 days to find the next match
  for (let i = 0; i < 7; i++) {
    const dayOfWeek = getDay(current)
    if (allowedDays.includes(dayOfWeek)) {
      return current
    }
    current = addDays(current, 1)
  }

  return current // Fallback (should theoretically always find one in 7 days)
}

/**
 * Legacy support for "Next M/W/F" - now just an alias for getNextOfficeDay
 */
export function getNextMWFDate(fromDate: Date = new Date()): Date {
  return getNextAvailableDay(fromDate, DEFAULT_OFFICE_DAYS, true)
}

/**
 * Get next office day (for tasks)
 */
export function getNextOfficeDay(
  fromDate: Date = new Date(), 
  officeDays: number[] = DEFAULT_OFFICE_DAYS
): Date {
  return getNextAvailableDay(fromDate, officeDays, true)
}

/**
 * Get next inspection day (for appointments)
 */
export function getNextInspectionDay(
  fromDate: Date = new Date(), 
  inspectionDays: number[] = DEFAULT_INSPECTION_DAYS
): Date {
  return getNextAvailableDay(fromDate, inspectionDays, true)
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
  let current = startOfDay(startDate)
  
  // Align start date to first allowed day if needed (including today)
  if (!allowedDays.includes(getDay(current))) {
    current = getNextAvailableDay(current, allowedDays, false)
  }
  
  while (isBefore(current, endDate) || isEqual(current, endDate)) {
    if (allowedDays.includes(getDay(current))) {
      dates.push(current)
    }
    current = addDays(current, 1)
  }
  
  return dates
}

/**
 * Calculate the next follow-up date based on office days pattern
 * For quotes sent on:
 * - Monday → Friday
 * - Tuesday → Friday  
 * - Wednesday → Monday
 * - Thursday → Monday
 * - Friday → Wednesday
 */
export function getNextFollowUpDate(
  fromDate: Date = new Date(),
  officeDays: number[] = DEFAULT_OFFICE_DAYS
): Date {
  // Skip to next office day from today
  return getNextOfficeDay(fromDate, officeDays)
}

// Task type definitions for generateTaskTitle
export type TaskTypeForTitle = 
  | 'FIRST_MESSAGE'
  | 'FIRST_MESSAGE_FOLLOW_UP'
  | 'SET_APPOINTMENT'
  | 'APPOINTMENT'
  | 'APPOINTMENT_REMINDER'
  | 'ASSIGN_STATUS'
  | 'WRITE_QUOTE'  // Legacy, maps to SEND_QUOTE
  | 'SEND_QUOTE'
  | 'QUOTE_FOLLOW_UP'
  | 'CLAIM_RECOMMENDATION'
  | 'CLAIM_REC_FOLLOW_UP'
  | 'PA_AGREEMENT'
  | 'PA_FOLLOW_UP'
  | 'CLAIM_FOLLOW_UP'
  | 'FOLLOW_UP'
  | 'CUSTOM'

/**
 * Generate task title based on contact name and task type
 */
export function generateTaskTitle(
  contactName: string, 
  taskType: TaskTypeForTitle,
  extra?: { appointmentDate?: Date; quoteType?: string }
): string {
  const name = contactName.trim()
  
  switch (taskType) {
    case 'FIRST_MESSAGE':
      return `${name} - Send First Message`
    
    case 'FIRST_MESSAGE_FOLLOW_UP':
      return `${name} - First Message Follow Up`
    
    case 'SET_APPOINTMENT':
      return `${name} - Schedule Initial Inspection`
    
    case 'APPOINTMENT':
      if (extra?.appointmentDate) {
        const dateStr = format(extra.appointmentDate, "EEE, MMM d 'at' h:mm a")
        return `${name} - Inspection: ${dateStr}`
      }
      return `${name} - Inspection Scheduled`
    
    case 'APPOINTMENT_REMINDER':
      return `${name} - Send Appointment Reminder`
    
    case 'ASSIGN_STATUS':
      return `${name} - Assign Status`
    
    case 'WRITE_QUOTE': // Legacy, treat same as SEND_QUOTE
    case 'SEND_QUOTE':
      if (extra?.quoteType) {
        return `${name} - Send Quote for ${extra.quoteType}`
      }
      return `${name} - Send Quote`
    
    case 'QUOTE_FOLLOW_UP':
      return `${name} - Quote Follow Up`
    
    case 'CLAIM_RECOMMENDATION':
      return `${name} - Send Claim Recommendation`
    
    case 'CLAIM_REC_FOLLOW_UP':
      return `${name} - Claim Rec Follow Up`
    
    case 'PA_AGREEMENT':
      return `${name} - Send PA Agreement`
    
    case 'PA_FOLLOW_UP':
      return `${name} - PA Agreement Follow Up`
    
    case 'CLAIM_FOLLOW_UP':
      return `${name} - Claim Follow Up`
    
    case 'FOLLOW_UP':
      return `${name} - Follow Up`
    
    case 'CUSTOM':
    default:
      return `${name} - Task`
  }
}

/**
 * Get the action button type for a given task type
 */
export function getActionButtonForTaskType(taskType: TaskTypeForTitle): string | null {
  const mapping: Record<string, string> = {
    'FIRST_MESSAGE': 'SEND_FIRST_MESSAGE',
    'FIRST_MESSAGE_FOLLOW_UP': 'SEND_FIRST_MESSAGE_FOLLOW_UP',
    'SET_APPOINTMENT': 'SCHEDULE_INSPECTION',
    'APPOINTMENT_REMINDER': 'SEND_APPOINTMENT_REMINDER',
    'ASSIGN_STATUS': 'ASSIGN_STATUS',
    'WRITE_QUOTE': 'SEND_QUOTE', // Legacy mapping
    'SEND_QUOTE': 'SEND_QUOTE',
    'QUOTE_FOLLOW_UP': 'SEND_QUOTE_FOLLOW_UP',
    'CLAIM_RECOMMENDATION': 'SEND_CLAIM_REC',
    'CLAIM_REC_FOLLOW_UP': 'SEND_CLAIM_REC_FOLLOW_UP',
    'PA_AGREEMENT': 'SEND_PA_AGREEMENT',
    'PA_FOLLOW_UP': 'SEND_PA_FOLLOW_UP',
    'CLAIM_FOLLOW_UP': 'SEND_CLAIM_FOLLOW_UP',
  }
  
  return mapping[taskType] || null
}

/**
 * Check if a date has passed (is before today)
 */
export function hasDatePassed(date: Date): boolean {
  return isBefore(startOfDay(date), startOfDay(new Date()))
}

/**
 * Get the spring reminder date for seasonal follow-ups
 * Returns March 1st of the next year if we're past March, otherwise March 1st of current year
 */
export function getSpringReminderDate(fromDate: Date = new Date()): Date {
  const year = fromDate.getFullYear()
  const march1 = new Date(year, 2, 1) // Month is 0-indexed, so 2 = March
  
  if (isBefore(fromDate, march1)) {
    return march1
  }
  
  // If we're past March, set for next year
  return new Date(year + 1, 2, 1)
}
