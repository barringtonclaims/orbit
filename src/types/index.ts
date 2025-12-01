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
} from '@prisma/client'

export {
  MemberRole,
  StageType,
  TaskStatus,
  TaskType,
  NoteType,
  FileType,
  TemplateType,
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
  createdAt: Date
  updatedAt: Date
  stage: {
    id: string
    name: string
    color: string
    stageType: 'ACTIVE' | 'APPROVED' | 'SEASONAL' | 'NOT_INTERESTED'
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
  appointmentTime: Date | null
  contact: {
    id: string
    firstName: string
    lastName: string
    phone: string | null
    email: string | null
    stage: {
      name: string
      color: string
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

