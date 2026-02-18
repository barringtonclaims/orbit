"use client";

import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar as CalendarWidget } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { rescheduleTasksBatch, setTasksDateBatch } from "@/lib/actions/tasks";
import { updateContactsStagesBatch, getLeadStages } from "@/lib/actions/stages";
import { TaskList } from "@/components/tasks/task-list";
import { BulkJoshDialog } from "@/components/tasks/bulk-josh-dialog";
import { FixMissingTasksButton } from "@/components/tasks/fix-missing-tasks-button";
import { format, startOfDay, endOfDay, isPast, isToday } from "date-fns";
import { 
  Clock, 
  AlertCircle, 
  Calendar,
  ListTodo,
  Snowflake,
  XCircle,
  Search,
  Loader2,
  CalendarClock,
  ArrowRight,
  X,
  CalendarDays,
  Zap,
} from "lucide-react";

interface Task {
  id: string;
  title: string;
  description: string | null;
  dueDate: Date;
  completedAt: Date | null;
  status: string;
  taskType: string;
  actionButton: string | null;
  currentAction: string | null;
  quickNotes: string | null;
  appointmentTime: Date | null;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    carrier: string | null;
    carrierId: string | null;
    claimNumber: string | null;
    adjusterEmail: string | null;
    quoteType: string | null;
    stage: {
      id: string;
      name: string;
      color: string;
      stageType: string;
      workflowType: string;
    } | null;
    carrierRef: {
      id: string;
      name: string;
      unifiedEmail: string | null;
      emailType: string;
    } | null;
  };
}

interface TasksViewProps {
  activeTasks: Task[];
  overdueTasks: Task[];
  todayTasks: Task[];
  upcomingTasks: Task[];
  seasonalTasks: Task[];
  notInterestedTasks: Task[];
  approvedTasks: Task[];
  stats: { today: number; upcoming: number; overdue: number; total: number } | null;
}

export function TasksView({
  activeTasks,
  overdueTasks,
  todayTasks,
  upcomingTasks,
  seasonalTasks,
  notInterestedTasks,
  approvedTasks,
  stats,
}: TasksViewProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkActing, setIsBulkActing] = useState(false);
  const [stages, setStages] = useState<{ id: string; name: string; color: string; isTerminal: boolean }[]>([]);
  const [mounted, setMounted] = useState(false);
  const [bulkDate, setBulkDate] = useState<Date | undefined>();
  const [showBulkJoshDialog, setShowBulkJoshDialog] = useState(false);

  // Portal mount detection
  useEffect(() => { setMounted(true); }, []);

  // Load stages for bulk status change
  useEffect(() => {
    getLeadStages().then((r) => {
      if (r.data) setStages(r.data);
    });
  }, []);

  const activeCount = activeTasks.length + approvedTasks.length;
  const overdueCount = overdueTasks.length;
  const todayCount = todayTasks.length;

  // Filter tasks by search
  const filterTasks = (tasks: Task[]) => {
    if (!search) return tasks;
    const q = search.toLowerCase();
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.contact.firstName.toLowerCase().includes(q) ||
        t.contact.lastName.toLowerCase().includes(q) ||
        t.contact.email?.toLowerCase().includes(q) ||
        t.contact.phone?.includes(q)
    );
  };

  const filteredActive = useMemo(() => {
    const now = new Date();
    const dayStart = startOfDay(now);
    const dayEnd = endOfDay(now);

    const approvedOverdue: Task[] = [];
    const approvedToday: Task[] = [];
    const approvedUpcoming: Task[] = [];
    for (const t of approvedTasks) {
      const d = new Date(t.dueDate);
      if (d < dayStart) approvedOverdue.push(t);
      else if (d <= dayEnd) approvedToday.push(t);
      else approvedUpcoming.push(t);
    }

    return {
      overdue: filterTasks([...overdueTasks, ...approvedOverdue]),
      today: filterTasks([...todayTasks, ...approvedToday]),
      upcoming: filterTasks([...upcomingTasks, ...approvedUpcoming]),
    };
  }, [search, overdueTasks, todayTasks, upcomingTasks, approvedTasks]);

  const filteredSeasonal = useMemo(() => filterTasks(seasonalTasks), [search, seasonalTasks]);
  const filteredNotInterested = useMemo(() => filterTasks(notInterestedTasks), [search, notInterestedTasks]);

  const filteredActiveTotal = filteredActive.overdue.length + filteredActive.today.length + filteredActive.upcoming.length;

  // All currently visible tasks (for select all)
  const allVisibleActive = useMemo(
    () => [...filteredActive.overdue, ...filteredActive.today, ...filteredActive.upcoming],
    [filteredActive]
  );

  // Multi-select
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = (tasks: Task[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      tasks.forEach((t) => next.add(t.id));
      return next;
    });
  };

  const deselectAll = (tasks: Task[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      tasks.forEach((t) => next.delete(t.id));
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const allActiveSelected = allVisibleActive.length > 0 && allVisibleActive.every((t) => selectedIds.has(t.id));
  const allSeasonalSelected = filteredSeasonal.length > 0 && filteredSeasonal.every((t) => selectedIds.has(t.id));
  const allNotInterestedSelected = filteredNotInterested.length > 0 && filteredNotInterested.every((t) => selectedIds.has(t.id));

  const allTaskPool = useMemo(
    () => [...activeTasks, ...approvedTasks, ...seasonalTasks, ...notInterestedTasks],
    [activeTasks, approvedTasks, seasonalTasks, notInterestedTasks]
  );

  const selectedTasks = useMemo(() => {
    if (selectedIds.size === 0) return [];
    return allTaskPool.filter((t) => selectedIds.has(t.id));
  }, [selectedIds, allTaskPool]);

  // Bulk actions
  const handleBulkReschedule = async (officeDays: number) => {
    setIsBulkActing(true);
    try {
      const result = await rescheduleTasksBatch(Array.from(selectedIds), officeDays);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Rescheduled ${result.updated} task(s)`);
      clearSelection();
      router.refresh();
    } catch {
      toast.error("Failed to reschedule tasks");
    } finally {
      setIsBulkActing(false);
    }
  };

  const handleBulkChangeStatus = async (stageId: string) => {
    setIsBulkActing(true);
    try {
      // Collect unique contact IDs from selected tasks
      const allTasks = [...activeTasks, ...seasonalTasks, ...notInterestedTasks, ...approvedTasks];
      const contactIds = Array.from(
        new Set(
          Array.from(selectedIds)
            .map((id) => allTasks.find((t) => t.id === id)?.contact.id)
            .filter(Boolean) as string[]
        )
      );

      const result = await updateContactsStagesBatch(contactIds, stageId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const stageName = stages.find((s) => s.id === stageId)?.name || "new status";
      toast.success(`Moved ${result.succeeded} contact(s) to "${stageName}"`);
      clearSelection();
      router.refresh();
    } catch {
      toast.error("Failed to update statuses");
    } finally {
      setIsBulkActing(false);
    }
  };

  const handleBulkSetDate = async (date: Date) => {
    setIsBulkActing(true);
    try {
      const result = await setTasksDateBatch(Array.from(selectedIds), date);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Rescheduled ${result.updated} task(s) to ${format(date, "MMM d")}`);
      clearSelection();
      setBulkDate(undefined);
      router.refresh();
    } catch {
      toast.error("Failed to reschedule");
    } finally {
      setIsBulkActing(false);
    }
  };

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
        <FixMissingTasksButton />
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

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search tasks by name, contact..."
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="active" className="space-y-4">
        <div className="overflow-x-auto -mx-1 px-1">
          <TabsList className="inline-flex w-auto min-w-full sm:w-auto">
            <TabsTrigger value="active" className="gap-1.5 text-xs sm:text-sm sm:gap-2">
              <ListTodo className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Active
              {activeCount > 0 && (
                <Badge variant={overdueCount > 0 ? "destructive" : "secondary"} className="ml-0.5 text-[10px] sm:ml-1 sm:text-xs">
                  {activeCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="seasonal" className="gap-1.5 text-xs sm:text-sm sm:gap-2">
              <Snowflake className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Seasonal
              {seasonalTasks.length > 0 && (
                <Badge variant="secondary" className="ml-0.5 text-[10px] sm:ml-1 sm:text-xs">{seasonalTasks.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="not_interested" className="gap-1.5 text-xs sm:text-sm sm:gap-2">
              <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Not Interested</span>
              <span className="sm:hidden">N/I</span>
              {notInterestedTasks.length > 0 && (
                <Badge variant="secondary" className="ml-0.5 text-[10px] sm:ml-1 sm:text-xs">{notInterestedTasks.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Active Tab */}
        <TabsContent value="active" className="space-y-6">
          {filteredActiveTotal > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{filteredActiveTotal} task{filteredActiveTotal !== 1 ? "s" : ""}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => allActiveSelected ? deselectAll(allVisibleActive) : selectAll(allVisibleActive)}
              >
                {allActiveSelected ? "Deselect All" : "Select All"}
              </Button>
            </div>
          )}
          {filteredActiveTotal === 0 ? (
            <Card className="p-8 text-center">
              <ListTodo className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">
                {(activeTasks.length + approvedTasks.length) === 0 ? "No active tasks. You're all caught up!" : "No tasks match your search."}
              </p>
            </Card>
          ) : (
            <>
              {filteredActive.overdue.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-destructive" />
                    <h3 className="font-semibold text-destructive">Overdue</h3>
                    <Badge variant="destructive">{filteredActive.overdue.length}</Badge>
                  </div>
                  <TaskList
                    tasks={filteredActive.overdue}
                    emptyMessage=""
                    showSectionHeader={false}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                  />
                </div>
              )}

              {filteredActive.today.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" />
                    <h3 className="font-semibold">Today</h3>
                    <Badge variant="secondary">{filteredActive.today.length}</Badge>
                  </div>
                  <TaskList
                    tasks={filteredActive.today}
                    emptyMessage=""
                    showSectionHeader={false}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                  />
                </div>
              )}

              {filteredActive.upcoming.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <h3 className="font-semibold text-muted-foreground">Upcoming</h3>
                    <Badge variant="outline">{filteredActive.upcoming.length}</Badge>
                  </div>
                  <TaskList
                    tasks={filteredActive.upcoming}
                    emptyMessage=""
                    showSectionHeader={false}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                  />
                </div>
              )}

            </>
          )}
        </TabsContent>

        {/* Seasonal Tab */}
        <TabsContent value="seasonal" className="space-y-3">
          {filteredSeasonal.length > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{filteredSeasonal.length} task{filteredSeasonal.length !== 1 ? "s" : ""}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => allSeasonalSelected ? deselectAll(filteredSeasonal) : selectAll(filteredSeasonal)}
              >
                {allSeasonalSelected ? "Deselect All" : "Select All"}
              </Button>
            </div>
          )}
          <TaskList
            tasks={filteredSeasonal}
            emptyMessage="No seasonal follow-up tasks."
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
        </TabsContent>

        {/* Not Interested Tab */}
        <TabsContent value="not_interested" className="space-y-3">
          {filteredNotInterested.length > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{filteredNotInterested.length} task{filteredNotInterested.length !== 1 ? "s" : ""}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => allNotInterestedSelected ? deselectAll(filteredNotInterested) : selectAll(filteredNotInterested)}
              >
                {allNotInterestedSelected ? "Deselect All" : "Select All"}
              </Button>
            </div>
          )}
          <TaskList
            tasks={filteredNotInterested}
            emptyMessage="No not-interested tasks."
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
        </TabsContent>
      </Tabs>

      {/* Floating Bulk Action Bar - rendered via portal to be truly fixed */}
      {mounted && selectedIds.size > 0 && createPortal(
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-background border-2 rounded-xl shadow-2xl px-5 py-3 flex items-center gap-3 animate-in slide-in-from-bottom-4">
          <span className="font-semibold text-sm whitespace-nowrap">{selectedIds.size} selected</span>

          <div className="w-px h-6 bg-border" />

          {/* Change Status */}
          <Select onValueChange={handleBulkChangeStatus} disabled={isBulkActing}>
            <SelectTrigger className="w-[170px] h-9">
              <div className="flex items-center gap-2">
                <ArrowRight className="w-4 h-4" />
                <span>Change Status</span>
              </div>
            </SelectTrigger>
            <SelectContent>
              {stages.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Reschedule by office days */}
          <Select onValueChange={(v) => handleBulkReschedule(parseInt(v))} disabled={isBulkActing}>
            <SelectTrigger className="w-[150px] h-9">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4" />
                <span>Reschedule</span>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Next Office Day</SelectItem>
              <SelectItem value="2">+2 Office Days</SelectItem>
              <SelectItem value="3">+3 Office Days</SelectItem>
            </SelectContent>
          </Select>

          {/* Pick a specific date */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 h-9" disabled={isBulkActing}>
                <CalendarDays className="w-4 h-4" />
                Set Date
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center" side="top">
              <CalendarWidget
                mode="single"
                selected={bulkDate}
                onSelect={(date) => {
                  if (date) {
                    setBulkDate(date);
                    handleBulkSetDate(date);
                  }
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {/* Bulk Josh Directives */}
          <Button
            variant="outline"
            size="sm"
            className="gap-2 h-9"
            disabled={isBulkActing}
            onClick={() => setShowBulkJoshDialog(true)}
          >
            <Zap className="w-4 h-4" />
            Bulk Action
          </Button>

          <div className="w-px h-6 bg-border" />

          {/* Clear */}
          <Button variant="ghost" size="sm" onClick={clearSelection} disabled={isBulkActing}>
            <X className="w-4 h-4 mr-1" />
            Clear
          </Button>

          {isBulkActing && <Loader2 className="w-4 h-4 animate-spin" />}
        </div>,
        document.body
      )}

      {/* Bulk Josh Dialog */}
      <BulkJoshDialog
        open={showBulkJoshDialog}
        onOpenChange={setShowBulkJoshDialog}
        tasks={selectedTasks}
        onComplete={() => {
          clearSelection();
          router.refresh();
        }}
      />
    </div>
  );
}
