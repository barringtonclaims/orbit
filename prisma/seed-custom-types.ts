import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_TASK_TYPES = [
  { name: "First Message", description: "New lead - send first message", order: 0 },
  { name: "First Message Follow Up", description: "Follow up if no response to first message", order: 1 },
  { name: "Set Appointment", description: "Schedule initial inspection", order: 2 },
  { name: "Discuss Inspection", description: "Discuss inspection results", order: 3 },
  { name: "Assign Status", description: "Post-inspection - assign retail or claim", order: 4 },
  { name: "Send Quote", description: "Write and send quote", order: 5 },
  { name: "Quote Follow Up", description: "Follow up on sent quote", order: 6 },
  { name: "Claim Recommendation", description: "Send initial claim recommendation", order: 7 },
  { name: "Claim Rec Follow Up", description: "Follow up on claim recommendation", order: 8 },
  { name: "PA Agreement", description: "Send PA agreement", order: 9 },
  { name: "PA Follow Up", description: "Follow up on PA agreement", order: 10 },
  { name: "Claim Follow Up", description: "Ongoing claim follow-up", order: 11 },
  { name: "Seasonal Follow Up", description: "Contact customer on seasonal date", order: 12 },
  { name: "Follow Up", description: "Generic follow-up", order: 13 },
  { name: "Custom", description: "Custom user-created task", order: 14 },
];

const DEFAULT_APPOINTMENT_TYPES = [
  { name: "Initial Inspection", includesLocation: true, order: 0 },
  { name: "Carrier Inspection", includesLocation: true, order: 1 },
  { name: "Pre-Start Meeting", includesLocation: true, order: 2 },
  { name: "Phone Call Only", includesLocation: false, order: 3 },
  { name: "Other", includesLocation: true, order: 4 },
];

async function main() {
  const orgs = await prisma.organization.findMany({ select: { id: true } });

  for (const org of orgs) {
    console.log(`Seeding custom types for org ${org.id}...`);

    for (const tt of DEFAULT_TASK_TYPES) {
      await prisma.customTaskType.upsert({
        where: { organizationId_name: { organizationId: org.id, name: tt.name } },
        update: {},
        create: {
          organizationId: org.id,
          name: tt.name,
          description: tt.description,
          isSystem: true,
          order: tt.order,
        },
      });
    }

    for (const at of DEFAULT_APPOINTMENT_TYPES) {
      await prisma.customAppointmentType.upsert({
        where: { organizationId_name: { organizationId: org.id, name: at.name } },
        update: {},
        create: {
          organizationId: org.id,
          name: at.name,
          includesLocation: at.includesLocation,
          isSystem: true,
          order: at.order,
        },
      });
    }
  }

  console.log("Done seeding custom types.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
