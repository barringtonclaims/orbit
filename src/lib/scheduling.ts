import { addDays, getDay, startOfDay, isBefore, isEqual, format, setMonth, setDate, addYears } from 'date-fns'

/**
 * Orbit Task Scheduling Logic
 * 
 * Configurable "Office Days" (for tasks) and "Inspection Days" (for appointments).
 * Default Office Days: Mon (1), Wed (3), Fri (5)
 * Default Inspection Days: Tue (2), Thu (4)
 * 
 * IMPORTANT: All task scheduling MUST go through these helpers to enforce office-day-only scheduling.
 */

const DEFAULT_OFFICE_DAYS = [1, 3, 5]
const DEFAULT_INSPECTION_DAYS = [2, 4]

/**
 * Check if a specific date is an office day
 * @param date The date to check
 * @param officeDays Array of allowed day numbers (0=Sun, 1=Mon, etc.)
 */
export function isOfficeDay(date: Date, officeDays: number[] = DEFAULT_OFFICE_DAYS): boolean {
  const dayOfWeek = getDay(date)
  return officeDays.includes(dayOfWeek)
}

/**
 * Check if a specific date is an inspection day
 */
export function isInspectionDay(date: Date, inspectionDays: number[] = DEFAULT_INSPECTION_DAYS): boolean {
  const dayOfWeek = getDay(date)
  return inspectionDays.includes(dayOfWeek)
}

/**
 * Validate and enforce that a date falls on an office day.
 * If the date is not an office day, returns the next office day instead.
 * This is a HARD RULE - all task scheduling must use this.
 */
export function enforceOfficeDay(date: Date, officeDays: number[] = DEFAULT_OFFICE_DAYS): Date {
  if (isOfficeDay(date, officeDays)) {
    return startOfDay(date)
  }
  return getNextOfficeDay(date, officeDays)
}

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
 * Get the Nth office day from a starting date
 * For example, getNthOfficeDay(3) returns the 3rd office day from now
 * 
 * @param n Number of office days to skip (1 = next office day, 2 = second office day, etc.)
 * @param fromDate Starting date (defaults to today)
 * @param officeDays Array of allowed days (0=Sunday, 1=Monday, etc.)
 */
export function getNthOfficeDay(
  n: number,
  fromDate: Date = new Date(),
  officeDays: number[] = DEFAULT_OFFICE_DAYS
): Date {
  if (n <= 0) return startOfDay(fromDate);
  
  let current = startOfDay(fromDate);
  let count = 0;
  
  // Start checking from tomorrow
  current = addDays(current, 1);
  
  while (count < n) {
    if (officeDays.includes(getDay(current))) {
      count++;
      if (count === n) {
        return current;
      }
    }
    current = addDays(current, 1);
  }
  
  return current;
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

/**
 * Get the next office day AFTER a specific date (e.g., day after an inspection)
 * This is used for scheduling "Discuss Inspection" tasks
 */
export function getNextOfficeDayAfter(date: Date, officeDays: number[] = DEFAULT_OFFICE_DAYS): Date {
  const dayAfter = addDays(startOfDay(date), 1)
  return getNextAvailableDay(dayAfter, officeDays, false)
}

/**
 * Calculate the seasonal follow-up date for a contact
 * @param seasonalMonth Month number (1-12)
 * @param seasonalDay Day of month (1-31)
 * @param fromDate Reference date (defaults to now)
 * @param officeDays Office days to enforce (seasonal date will be adjusted to next office day if needed)
 */
export function getSeasonalFollowUpDate(
  seasonalMonth: number = 4,
  seasonalDay: number = 1,
  fromDate: Date = new Date(),
  officeDays: number[] = DEFAULT_OFFICE_DAYS
): Date {
  const currentYear = fromDate.getFullYear()
  
  // Create the seasonal date for this year (month is 0-indexed)
  let seasonalDate = new Date(currentYear, seasonalMonth - 1, seasonalDay)
  
  // If we're past this year's seasonal date, use next year
  if (isBefore(seasonalDate, fromDate)) {
    seasonalDate = new Date(currentYear + 1, seasonalMonth - 1, seasonalDay)
  }
  
  // Enforce office day - if the seasonal date isn't an office day, move to next office day
  return enforceOfficeDay(seasonalDate, officeDays)
}

// Task type definitions for generateTaskTitle
export type TaskTypeForTitle = 
  | 'FIRST_MESSAGE'
  | 'FIRST_MESSAGE_FOLLOW_UP'
  | 'SET_APPOINTMENT'
  | 'APPOINTMENT'
  | 'APPOINTMENT_REMINDER'
  | 'DISCUSS_INSPECTION'
  | 'ASSIGN_STATUS'
  | 'WRITE_QUOTE'  // Legacy, maps to SEND_QUOTE
  | 'SEND_QUOTE'
  | 'QUOTE_FOLLOW_UP'
  | 'CLAIM_RECOMMENDATION'
  | 'CLAIM_REC_FOLLOW_UP'
  | 'PA_AGREEMENT'
  | 'PA_FOLLOW_UP'
  | 'CLAIM_FOLLOW_UP'
  | 'SEASONAL_FOLLOW_UP'
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
      return `${name} - Set Initial Inspection`
    
    case 'APPOINTMENT':
      if (extra?.appointmentDate) {
        const dateStr = format(extra.appointmentDate, "EEE, MMM d 'at' h:mm a")
        return `${name} - Inspection: ${dateStr}`
      }
      return `${name} - Inspection Scheduled`
    
    case 'APPOINTMENT_REMINDER':
      return `${name} - Send Appointment Reminder`
    
    case 'DISCUSS_INSPECTION':
      return `${name} - Discuss Initial Inspection`
    
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
    
    case 'SEASONAL_FOLLOW_UP':
      return `${name} - Seasonal Follow Up`
    
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
    'DISCUSS_INSPECTION': 'ASSIGN_STATUS', // After discussing, user assigns retail/claim
    'ASSIGN_STATUS': 'ASSIGN_STATUS',
    'WRITE_QUOTE': 'SEND_QUOTE', // Legacy mapping
    'SEND_QUOTE': 'SEND_QUOTE',
    'QUOTE_FOLLOW_UP': 'SEND_QUOTE_FOLLOW_UP',
    'CLAIM_RECOMMENDATION': 'SEND_CLAIM_REC',
    'CLAIM_REC_FOLLOW_UP': 'SEND_CLAIM_REC_FOLLOW_UP',
    'PA_AGREEMENT': 'SEND_PA_AGREEMENT',
    'PA_FOLLOW_UP': 'SEND_PA_FOLLOW_UP',
    'CLAIM_FOLLOW_UP': 'SEND_CLAIM_FOLLOW_UP',
    'SEASONAL_FOLLOW_UP': 'SEND_SEASONAL_MESSAGE',
  }
  
  return mapping[taskType] || null
}

/**
 * Get the CURRENT action for a task based on its type and progress.
 * This is for the dynamic action button that changes based on workflow state.
 * 
 * For SET_APPOINTMENT:
 * - Before first message sent: SEND_FIRST_MESSAGE
 * - After first message sent: SCHEDULE_INSPECTION or SEND_FIRST_MESSAGE_FOLLOW_UP
 */
export function getCurrentActionForTask(
  taskType: TaskTypeForTitle,
  contact: { firstMessageSentAt?: Date | null }
): string {
  if (taskType === 'SET_APPOINTMENT') {
    if (!contact.firstMessageSentAt) {
      return 'SEND_FIRST_MESSAGE'
    }
    return 'SCHEDULE_INSPECTION'
  }
  
  // For other task types, the action is determined by the task type itself
  return getActionButtonForTaskType(taskType) || 'JOSH_DRAFT_MESSAGE'
}

/**
 * Check if a date has passed (is before today)
 */
export function hasDatePassed(date: Date): boolean {
  return isBefore(startOfDay(date), startOfDay(new Date()))
}

/**
 * Get the spring reminder date for seasonal follow-ups
 * @deprecated Use getSeasonalFollowUpDate instead for configurable dates
 * Returns March 1st of the next year if we're past March, otherwise March 1st of current year
 */
export function getSpringReminderDate(fromDate: Date = new Date()): Date {
  return getSeasonalFollowUpDate(3, 1, fromDate) // Default to March 1st
}

/**
 * Get the next task in the workflow sequence based on current task and outcome
 */
export function getNextTaskInWorkflow(
  currentTaskType: TaskTypeForTitle,
  outcome: 'completed' | 'retail' | 'claim' | 'seasonal' | 'approved' | 'not_interested'
): TaskTypeForTitle | null {
  const workflowTransitions: Record<string, Record<string, TaskTypeForTitle | null>> = {
    'FIRST_MESSAGE': {
      'completed': 'SET_APPOINTMENT', // After first message, task stays SET_APPOINTMENT but action changes
    },
    'SET_APPOINTMENT': {
      'completed': 'DISCUSS_INSPECTION', // After inspection scheduled, next is discuss
    },
    'APPOINTMENT': {
      'completed': 'DISCUSS_INSPECTION', // After inspection completed
    },
    'DISCUSS_INSPECTION': {
      'retail': 'SEND_QUOTE',
      'claim': 'CLAIM_RECOMMENDATION',
      'seasonal': 'SEASONAL_FOLLOW_UP',
      'not_interested': null,
    },
    'ASSIGN_STATUS': {
      'retail': 'SEND_QUOTE',
      'claim': 'CLAIM_RECOMMENDATION',
      'seasonal': 'SEASONAL_FOLLOW_UP',
      'not_interested': null,
    },
    'SEND_QUOTE': {
      'completed': 'QUOTE_FOLLOW_UP',
      'approved': null, // Job approved - no more tasks
    },
    'QUOTE_FOLLOW_UP': {
      'completed': 'QUOTE_FOLLOW_UP', // Keep following up
      'approved': null,
      'seasonal': 'SEASONAL_FOLLOW_UP',
      'not_interested': null,
    },
    'CLAIM_RECOMMENDATION': {
      'completed': 'CLAIM_REC_FOLLOW_UP',
    },
    'CLAIM_REC_FOLLOW_UP': {
      'completed': 'PA_AGREEMENT',
      'seasonal': 'SEASONAL_FOLLOW_UP',
      'not_interested': null,
    },
    'PA_AGREEMENT': {
      'completed': 'PA_FOLLOW_UP',
    },
    'PA_FOLLOW_UP': {
      'completed': 'CLAIM_FOLLOW_UP',
      'approved': null,
    },
    'CLAIM_FOLLOW_UP': {
      'completed': 'CLAIM_FOLLOW_UP', // Keep following up on open claims
      'approved': null,
    },
    'SEASONAL_FOLLOW_UP': {
      'completed': 'SET_APPOINTMENT', // Reactivate - start from beginning
    },
  }
  
  return workflowTransitions[currentTaskType]?.[outcome] ?? null
}
