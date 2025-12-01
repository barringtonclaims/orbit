import Link from "next/link";
import { getTasks, getTaskStats } from "@/lib/actions/tasks";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TaskList } from "@/components/tasks/task-list";
import { 
  CheckSquare, 
  Clock, 
  AlertCircle, 
  Calendar,
  CheckCircle2
} from "lucide-react";

export const metadata = {
  title: "Tasks",
};

export default async function TasksPage() {
  const [
    { data: todayTasks },
    { data: upcomingTasks },
    { data: overdueTasks },
    { data: completedTasks },
    { data: stats },
  ] = await Promise.all([
    getTasks({ view: "today" }),
    getTasks({ view: "upcoming" }),
    getTasks({ view: "overdue" }),
    getTasks({ view: "completed" }),
    getTaskStats(),
  ]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Tasks</h1>
          <p className="text-muted-foreground mt-1">
            Your follow-ups and to-dos
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.today || 0}</p>
              <p className="text-sm text-muted-foreground">Due Today</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted text-muted-foreground flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.upcoming || 0}</p>
              <p className="text-sm text-muted-foreground">Upcoming</p>
            </div>
          </div>
        </Card>
        <Card className={`p-4 ${(stats?.overdue || 0) > 0 ? "border-destructive/50" : ""}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              (stats?.overdue || 0) > 0 
                ? "bg-destructive/10 text-destructive" 
                : "bg-muted text-muted-foreground"
            }`}>
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.overdue || 0}</p>
              <p className="text-sm text-muted-foreground">Overdue</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Task Tabs */}
      <Tabs defaultValue="today" className="space-y-4">
        <TabsList>
          <TabsTrigger value="today" className="gap-2">
            <Clock className="w-4 h-4" />
            Today
            {(todayTasks?.length || 0) > 0 && (
              <Badge variant="secondary" className="ml-1">
                {todayTasks?.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="gap-2">
            <Calendar className="w-4 h-4" />
            Upcoming
          </TabsTrigger>
          <TabsTrigger value="overdue" className="gap-2">
            <AlertCircle className="w-4 h-4" />
            Overdue
            {(overdueTasks?.length || 0) > 0 && (
              <Badge variant="destructive" className="ml-1">
                {overdueTasks?.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Completed
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today">
          <TaskList
            tasks={todayTasks || []}
            emptyMessage="No tasks due today. You're all caught up!"
          />
        </TabsContent>

        <TabsContent value="upcoming">
          <TaskList
            tasks={upcomingTasks || []}
            emptyMessage="No upcoming tasks scheduled."
          />
        </TabsContent>

        <TabsContent value="overdue">
          <TaskList
            tasks={overdueTasks || []}
            emptyMessage="No overdue tasks. Great job staying on top of things!"
          />
        </TabsContent>

        <TabsContent value="completed">
          <TaskList
            tasks={completedTasks || []}
            emptyMessage="No completed tasks yet."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
