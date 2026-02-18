import { createClient } from "@/lib/supabase/server";
import { getDashboardStats, getRecentTasks } from "@/lib/actions/dashboard";
import { getJoshActivitySummary } from "@/lib/actions/josh";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { format } from "date-fns";
import { 
  Users, 
  CheckSquare, 
  Clock, 
  AlertCircle, 
  Plus,
  ArrowRight,
  TrendingUp,
  Calendar,
  Bot,
  Mail,
  UserPlus,
  Link2,
  Sparkles
} from "lucide-react";

// Disable static caching - always fetch fresh data
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || "there";

  const [{ data: stats }, { data: recentTasks }, { data: joshActivity }] = await Promise.all([
    getDashboardStats(),
    getRecentTasks(),
    getJoshActivitySummary(),
  ]);

  const dashboardStats = stats || {
    totalContacts: 0,
    activeLeads: 0,
    tasksDueToday: 0,
    overdueTasks: 0,
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">
            Good {getGreeting()}, {firstName}!
          </h1>
          <p className="text-muted-foreground mt-1">
            Here&apos;s what&apos;s happening with your leads today.
          </p>
        </div>
        <Link href="/contacts/new">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Add Contact
          </Button>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Contacts"
          value={dashboardStats.totalContacts}
          icon={<Users className="w-5 h-5" />}
          description="All leads in system"
        />
        <StatCard
          title="Active Leads"
          value={dashboardStats.activeLeads}
          icon={<TrendingUp className="w-5 h-5" />}
          description="In progress"
          accent
        />
        <StatCard
          title="Due Today"
          value={dashboardStats.tasksDueToday}
          icon={<Clock className="w-5 h-5" />}
          description="Tasks to complete"
        />
        <StatCard
          title="Overdue"
          value={dashboardStats.overdueTasks}
          icon={<AlertCircle className="w-5 h-5" />}
          description="Needs attention"
          warning={dashboardStats.overdueTasks > 0}
        />
      </div>

      {/* Josh Activity Summary */}
      {joshActivity && (joshActivity.recentActivities.length > 0 || joshActivity.totalLeadsCreated > 0) && (
        <Card className="border-blue-500/20 bg-gradient-to-r from-blue-500/5 to-purple-500/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  Josh&apos;s Update
                  <Sparkles className="w-4 h-4 text-purple-500" />
                </CardTitle>
                <CardDescription>Your AI assistant has been busy</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-3 rounded-lg bg-green-500/10">
                <UserPlus className="w-5 h-5 mx-auto text-green-600 mb-1" />
                <p className="text-2xl font-bold text-green-600">{joshActivity.totalLeadsCreated}</p>
                <p className="text-xs text-muted-foreground">Leads Created</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-blue-500/10">
                <Link2 className="w-5 h-5 mx-auto text-blue-600 mb-1" />
                <p className="text-2xl font-bold text-blue-600">{joshActivity.emailsLinked}</p>
                <p className="text-xs text-muted-foreground">Emails Linked</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-orange-500/10">
                <Mail className="w-5 h-5 mx-auto text-orange-600 mb-1" />
                <p className="text-2xl font-bold text-orange-600">{joshActivity.carrierEmails}</p>
                <p className="text-xs text-muted-foreground">Carrier Emails</p>
              </div>
            </div>
            {joshActivity.recentActivities.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Recent Activity</p>
                {joshActivity.recentActivities.slice(0, 3).map((activity) => (
                  <div key={activity.id} className="flex items-start gap-2 text-sm p-2 rounded-lg bg-muted/50">
                    <JoshActivityIcon type={activity.activityType} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{activity.title}</p>
                      {activity.description && (
                        <p className="text-xs text-muted-foreground truncate">{activity.description}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(activity.createdAt), "h:mm a")}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {!joshActivity.gmailConnected && (
              <div className="mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <p className="text-sm text-yellow-700 dark:text-yellow-400">
                  Connect your Gmail to let Josh automatically process your emails.
                </p>
                <Link href="/settings?tab=josh">
                  <Button size="sm" variant="outline" className="mt-2">
                    Connect Gmail
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick Actions & Today's Tasks */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Today's Tasks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-lg">Today&apos;s Tasks</CardTitle>
              <CardDescription>Your follow-ups for today</CardDescription>
            </div>
            <Link href="/tasks">
              <Button variant="ghost" size="sm" className="gap-1">
                View all
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {!recentTasks || recentTasks.length === 0 ? (
              <div className="text-center py-8">
                <CheckSquare className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">No tasks due today</p>
                <p className="text-sm text-muted-foreground/75">
                  Add contacts to start building your task list
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentTasks.map((task) => (
                  <Link
                    key={task.id}
                    href={`/contacts/${task.contact.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div>
                      <p className="font-medium">{task.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {task.contact.firstName} {task.contact.lastName}
                      </p>
                    </div>
                    <Badge variant="secondary" className="gap-1">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(task.dueDate), "h:mm a")}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
            <CardDescription>Common tasks to get started</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/contacts/new" className="block">
              <QuickActionItem
                icon={<Plus className="w-5 h-5" />}
                title="Add New Contact"
                description="Create a new lead entry"
              />
            </Link>
            <Link href="/tasks" className="block">
              <QuickActionItem
                icon={<CheckSquare className="w-5 h-5" />}
                title="View All Tasks"
                description="See your complete task list"
              />
            </Link>
            <Link href="/templates" className="block">
              <QuickActionItem
                icon={<Clock className="w-5 h-5" />}
                title="Message Templates"
                description="Manage your SMS and email templates"
              />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Getting Started Guide (show only if no contacts) */}
      {dashboardStats.totalContacts === 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-lg">Getting Started with Relay</CardTitle>
            <CardDescription>
              Follow these steps to set up your workflow
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <GettingStartedStep
                number={1}
                title="Add your first contact"
                description="Enter lead information to start tracking"
                action={
                  <Link href="/contacts/new">
                    <Button size="sm">Add Contact</Button>
                  </Link>
                }
              />
              <GettingStartedStep
                number={2}
                title="Set up message templates"
                description="Create reusable SMS and email templates"
                action={
                  <Link href="/templates">
                    <Button size="sm" variant="outline">Create Template</Button>
                  </Link>
                }
              />
              <GettingStartedStep
                number={3}
                title="Invite your team (optional)"
                description="Collaborate with team members on leads"
                action={
                  <Link href="/team">
                    <Button size="sm" variant="outline">Manage Team</Button>
                  </Link>
                }
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function StatCard({
  title,
  value,
  icon,
  description,
  accent,
  warning,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  description: string;
  accent?: boolean;
  warning?: boolean;
}) {
  return (
    <Card className={warning ? "border-destructive/50" : accent ? "border-primary/50" : ""}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-2">
          <span className={`${warning ? "text-destructive" : accent ? "text-primary" : "text-muted-foreground"}`}>
            {icon}
          </span>
        </div>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{title}</p>
      </CardContent>
    </Card>
  );
}

function QuickActionItem({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer">
      <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
        {icon}
      </div>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function GettingStartedStep({
  number,
  title,
  description,
  action,
}: {
  number: number;
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">
        {number}
      </div>
      <div className="flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

function JoshActivityIcon({ type }: { type: string }) {
  switch (type) {
    case "LEAD_CREATED":
    case "LEAD_CREATED_ACCULYNX":
      return <UserPlus className="w-4 h-4 text-green-500 mt-0.5" />;
    case "EMAIL_LINKED":
      return <Link2 className="w-4 h-4 text-blue-500 mt-0.5" />;
    case "CARRIER_EMAIL_RECEIVED":
      return <Mail className="w-4 h-4 text-orange-500 mt-0.5" />;
    default:
      return <Mail className="w-4 h-4 text-muted-foreground mt-0.5" />;
  }
}
