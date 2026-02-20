import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TITLE_PATTERNS: [RegExp, string][] = [
  [/- Send First Message$/i, "First Message"],
  [/- First Message Follow Up$/i, "First Message Follow Up"],
  [/- Set Appointment$/i, "Set Appointment"],
  [/- Appointment$/i, "Set Appointment"],
  [/- Appointment Reminder$/i, "Set Appointment"],
  [/- Discuss Inspection$/i, "Discuss Inspection"],
  [/- Assign Status$/i, "Assign Status"],
  [/- Send Quote$/i, "Send Quote"],
  [/- Write Quote$/i, "Send Quote"],
  [/- Quote Follow Up$/i, "Quote Follow Up"],
  [/- Claim Recommendation$/i, "Claim Recommendation"],
  [/- Claim Rec Follow Up$/i, "Claim Rec Follow Up"],
  [/- PA Agreement$/i, "PA Agreement"],
  [/- PA Follow Up$/i, "PA Follow Up"],
  [/- Claim Follow Up$/i, "Claim Follow Up"],
  [/- Seasonal Follow Up$/i, "Seasonal Follow Up"],
  [/- Follow Up$/i, "Follow Up"],
  [/- Approval Check In$/i, "Follow Up"],
  [/- Addendum/i, "Claim Follow Up"],
];

async function main() {
  const tasks = await prisma.task.findMany({
    select: { id: true, title: true, taskType: true },
  });

  let updated = 0;
  let unmatched = 0;
  const unmatchedTitles: string[] = [];

  for (const task of tasks) {
    let matched = false;
    for (const [pattern, typeName] of TITLE_PATTERNS) {
      if (pattern.test(task.title)) {
        if (task.taskType !== typeName) {
          await prisma.task.update({
            where: { id: task.id },
            data: { taskType: typeName },
          });
          updated++;
        }
        matched = true;
        break;
      }
    }
    if (!matched) {
      unmatched++;
      if (!unmatchedTitles.includes(task.title)) {
        unmatchedTitles.push(task.title);
      }
    }
  }

  console.log(`Updated ${updated} tasks out of ${tasks.length} total.`);
  console.log(`Unmatched: ${unmatched} tasks.`);
  if (unmatchedTitles.length > 0) {
    console.log("Unmatched title examples:");
    unmatchedTitles.slice(0, 15).forEach((t) => console.log(`  - ${t}`));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
