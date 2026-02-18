import { getTasks, getTaskStats } from "@/lib/actions/tasks";
import { TasksView } from "@/components/tasks/tasks-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tasks",
};

export default async function TasksPage() {
  const [
    { data: todayTasks },
    { data: upcomingTasks },
    { data: overdueTasks },
    { data: seasonalTasks },
    { data: notInterestedTasks },
    { data: approvedTasks },
    { data: stats },
  ] = await Promise.all([
    getTasks({ view: "today" }),
    getTasks({ view: "upcoming" }),
    getTasks({ view: "overdue" }),
    getTasks({ view: "seasonal" }),
    getTasks({ view: "not_interested" }),
    getTasks({ view: "approved" }),
    getTaskStats(),
  ]);

  const activeTasks = [
    ...(overdueTasks || []),
    ...(todayTasks || []),
    ...(upcomingTasks || []),
  ];

  return (
    <TasksView
      activeTasks={activeTasks}
      overdueTasks={overdueTasks || []}
      todayTasks={todayTasks || []}
      upcomingTasks={upcomingTasks || []}
      seasonalTasks={seasonalTasks || []}
      notInterestedTasks={notInterestedTasks || []}
      approvedTasks={approvedTasks || []}
      stats={stats}
    />
  );
}
