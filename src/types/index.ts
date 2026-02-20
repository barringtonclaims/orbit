// Re-export Prisma types for convenience
export type {
  User,
  Organization,
  OrganizationMember,
  Contact,
  LeadStage,
  Task,
  Note,
  ContactFile,
  MessageTemplate,
  GoogleToken,
} from '@prisma/client'

export {
  MemberRole,
  StageType,
  WorkflowType,
  TaskStatus,
  NoteType,
  FileType,
  TemplateType,
  JobStatus,
} from '@prisma/client'

// Extended types with relations
export interface ContactWithRelations {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zipCode: string | null
  source: string | null
  notes: string | null
  // Retail fields
  quoteType: string | null
  // Claim fields
  carrier: string | null
  dateOfLoss: Date | null
  policyNumber: string | null
  claimNumber: string | null
  // Seasonal
  seasonalReminderDate: Date | null
  // Workflow state tracking
  firstMessageSentAt: Date | null
  claimRecSentAt: Date | null
  paSentAt: Date | null
  quoteSentAt: Date | null
  // Job tracking
  jobStatus: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | null
  jobScheduledDate: Date | null
  jobCompletedDate: Date | null
  // Timestamps
  createdAt: Date
  updatedAt: Date
  stage: {
    id: string
    name: string
    color: string
    stageType: 'ACTIVE' | 'APPROVED' | 'SEASONAL' | 'NOT_INTERESTED'
    workflowType: 'RETAIL' | 'CLAIM' | 'BOTH' | 'TERMINAL'
  } | null
  assignedTo: {
    id: string
    fullName: string
    email: string
    avatarUrl: string | null
  } | null
  tasks: {
    id: string
    title: string
    dueDate: Date
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
    taskType: string
  }[]
  _count: {
    timeline: number
    files: number
  }
}

export interface TaskWithContact {
  id: string
  title: string
  description: string | null
  dueDate: Date
  completedAt: Date | null
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  taskType: string
  contact: {
    id: string
    firstName: string
    lastName: string
    phone: string | null
    email: string | null
    address: string | null
    carrier: string | null
    stage: {
      name: string
      color: string
      stageType: string
      workflowType: string
    } | null
  }
}

export interface UserSession {
  id: string
  email: string
  fullName: string
  avatarUrl: string | null
  currentOrganization: {
    id: string
    name: string
    slug: string
    role: 'OWNER' | 'MANAGER' | 'MEMBER'
  } | null
}

// Stage names as constants for workflow logic
export const STAGE_NAMES = {
  NEW_LEAD: 'New Lead',
  SCHEDULED_INSPECTION: 'Scheduled Inspection',
  RETAIL_PROSPECT: 'Retail Prospect',
  CLAIM_PROSPECT: 'Claim Prospect',
  OPEN_CLAIM: 'Open Claim',
  APPROVED: 'Approved Job',
  SEASONAL: 'Seasonal Follow Up',
  NOT_INTERESTED: 'Not Interested',
} as const

// Task type to action button mapping
export const TASK_ACTION_BUTTONS: Record<string, string> = {
  FIRST_MESSAGE: 'SEND_FIRST_MESSAGE',
  FIRST_MESSAGE_FOLLOW_UP: 'SEND_FIRST_MESSAGE_FOLLOW_UP',
  SET_APPOINTMENT: 'SCHEDULE_INSPECTION',
  APPOINTMENT_REMINDER: 'SEND_APPOINTMENT_REMINDER',
  ASSIGN_STATUS: 'ASSIGN_STATUS',
  SEND_QUOTE: 'SEND_QUOTE',
  QUOTE_FOLLOW_UP: 'SEND_QUOTE_FOLLOW_UP',
  CLAIM_RECOMMENDATION: 'SEND_CLAIM_REC',
  CLAIM_REC_FOLLOW_UP: 'SEND_CLAIM_REC_FOLLOW_UP',
  PA_AGREEMENT: 'SEND_PA_AGREEMENT',
  PA_FOLLOW_UP: 'SEND_PA_FOLLOW_UP',
  CLAIM_FOLLOW_UP: 'SEND_CLAIM_FOLLOW_UP',
}

// Template categories by stage
export const TEMPLATE_CATEGORIES_BY_STAGE: Record<string, string[]> = {
  'New Lead': ['FIRST_MESSAGE', 'FIRST_MESSAGE_FOLLOW_UP'],
  'Scheduled Inspection': ['APPOINTMENT_REMINDER', 'GENERAL'],
  'Retail Prospect': ['QUOTE', 'QUOTE_FOLLOW_UP'],
  'Claim Prospect': ['CLAIM_RECOMMENDATION', 'CLAIM_REC_FOLLOW_UP', 'PA_AGREEMENT', 'PA_FOLLOW_UP'],
  'Open Claim': ['CLAIM_FOLLOW_UP', 'CARRIER_FOLLOW_UP'],
  'Seasonal Follow Up': ['SEASONAL', 'FIRST_MESSAGE'],
  'Approved Job': ['GENERAL'],
  'Not Interested': ['GENERAL'],
}

// Template categories by task type (for the modular action button)
export const TEMPLATE_CATEGORIES_BY_TASK: Record<string, string> = {
  'FIRST_MESSAGE': 'FIRST_MESSAGE',
  'FIRST_MESSAGE_FOLLOW_UP': 'FIRST_MESSAGE_FOLLOW_UP',
  'APPOINTMENT_REMINDER': 'APPOINTMENT_REMINDER',
  'SEND_QUOTE': 'QUOTE',
  'QUOTE_FOLLOW_UP': 'QUOTE_FOLLOW_UP',
  'CLAIM_RECOMMENDATION': 'CLAIM_RECOMMENDATION',
  'CLAIM_REC_FOLLOW_UP': 'CLAIM_REC_FOLLOW_UP',
  'PA_AGREEMENT': 'PA_AGREEMENT',
  'PA_FOLLOW_UP': 'PA_FOLLOW_UP',
  'CLAIM_FOLLOW_UP': 'CLAIM_FOLLOW_UP',
}
