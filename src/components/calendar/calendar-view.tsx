"use client";

import { useState } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  isToday,
  getDay,
  addDays,
  subDays,
} from "date-fns";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  CheckSquare,
  MapPin,
  Phone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface CalendarTask {
  id: string;
  title: string;
  dueDate: Date;
  taskType: string;
  status: string;
  contact: { id: string; firstName: string; lastName: string };
}

interface CalendarAppointment {
  id: string;
  title: string;
  type: string;
  startTime: Date;
  endTime: Date | null;
  location: string | null;
  description: string | null;
  contact: { id: string; firstName: string; lastName: string };
}

interface CalendarViewProps {
  tasks: CalendarTask[];
  appointments: CalendarAppointment[];
  settings: {
    officeDays: number[];
    inspectionDays: number[];
  };
}

type ViewMode = "month" | "day";
type FilterMode = "all" | "tasks" | "appointments";

export function CalendarView({ tasks, appointments, settings }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [selectedDay, setSelectedDay] = useState(new Date());

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth)),
    end: endOfWeek(endOfMonth(currentMonth)),
  });

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const goToToday = () => {
    setCurrentMonth(new Date());
    setSelectedDay(new Date());
  };

  const getDayType = (day: Date) => {
    const dayOfWeek = getDay(day);
    if (settings.inspectionDays.includes(dayOfWeek)) return "inspection";
    if (settings.officeDays.includes(dayOfWeek)) return "office";
    return "off";
  };

  const getTasksForDay = (day: Date) =>
    tasks.filter((t) => isSameDay(new Date(t.dueDate), day));

  const getAppointmentsForDay = (day: Date) =>
    appointments
      .filter((a) => isSameDay(new Date(a.startTime), day))
      .sort(
        (a, b) =>
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );

  function handleDayClick(day: Date) {
    setSelectedDay(day);
    setViewMode("day");
  }

  const nextDay = () => setSelectedDay(addDays(selectedDay, 1));
  const prevDay = () => setSelectedDay(subDays(selectedDay, 1));

  return (
    <div className="space-y-4 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card p-4 rounded-xl border shadow-sm">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold w-48">
            {viewMode === "month"
              ? format(currentMonth, "MMMM yyyy")
              : format(selectedDay, "EEEE, MMM d")}
          </h2>
          <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
            <Button
              variant="ghost"
              size="icon"
              onClick={viewMode === "month" ? prevMonth : prevDay}
              className="h-7 w-7"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={goToToday}
              className="h-7 text-xs px-3 font-normal"
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={viewMode === "month" ? nextMonth : nextDay}
              className="h-7 w-7"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
            <Button
              variant={viewMode === "month" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs px-3"
              onClick={() => setViewMode("month")}
            >
              Month
            </Button>
            <Button
              variant={viewMode === "day" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs px-3"
              onClick={() => {
                setViewMode("day");
                setSelectedDay(new Date());
              }}
            >
              Day
            </Button>
          </div>

          {/* Filter toggle */}
          <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
            {(["all", "tasks", "appointments"] as FilterMode[]).map((f) => (
              <Button
                key={f}
                variant={filterMode === f ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs px-3 capitalize"
                onClick={() => setFilterMode(f)}
              >
                {f}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {viewMode === "month" ? (
        <MonthView
          days={days}
          currentMonth={currentMonth}
          settings={settings}
          getDayType={getDayType}
          getTasksForDay={getTasksForDay}
          getAppointmentsForDay={getAppointmentsForDay}
          filterMode={filterMode}
          onDayClick={handleDayClick}
        />
      ) : (
        <DayView
          day={selectedDay}
          dayType={getDayType(selectedDay)}
          tasks={getTasksForDay(selectedDay)}
          appointments={getAppointmentsForDay(selectedDay)}
          filterMode={filterMode}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── Month View ─────────────────────────── */

function MonthView({
  days,
  currentMonth,
  getDayType,
  getTasksForDay,
  getAppointmentsForDay,
  filterMode,
  onDayClick,
}: {
  days: Date[];
  currentMonth: Date;
  settings: { officeDays: number[]; inspectionDays: number[] };
  getDayType: (day: Date) => string;
  getTasksForDay: (day: Date) => CalendarTask[];
  getAppointmentsForDay: (day: Date) => CalendarAppointment[];
  filterMode: FilterMode;
  onDayClick: (day: Date) => void;
}) {
  return (
    <div className="bg-card rounded-xl border shadow-sm overflow-hidden w-full">
      {/* Weekday headers */}
      <div
        className="grid border-b bg-muted/30"
        style={{ gridTemplateColumns: "repeat(7, 1fr)" }}
      >
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider"
          >
            {d}
          </div>
        ))}
      </div>

      <div
        className="grid bg-muted/20 gap-px"
        style={{
          gridTemplateColumns: "repeat(7, 1fr)",
          gridAutoRows: "minmax(120px, 160px)",
        }}
      >
        {days.map((day) => {
          const dayType = getDayType(day);
          const dayTasks = getTasksForDay(day);
          const dayAppointments = getAppointmentsForDay(day);
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isTodayDate = isToday(day);

          const showTasks = filterMode === "all" || filterMode === "tasks";
          const showAppts = filterMode === "all" || filterMode === "appointments";

          const items: { type: "task" | "appt"; data: CalendarTask | CalendarAppointment }[] = [];
          if (showAppts) dayAppointments.forEach((a) => items.push({ type: "appt", data: a }));
          if (showTasks) dayTasks.forEach((t) => items.push({ type: "task", data: t }));

          const maxVisible = 3;
          const visible = items.slice(0, maxVisible);
          const overflow = items.length - maxVisible;

          return (
            <div
              key={day.toString()}
              className={cn(
                "bg-background p-2 transition-all relative group overflow-hidden cursor-pointer hover:bg-muted/10",
                !isCurrentMonth && "bg-muted/5 text-muted-foreground/50",
                isCurrentMonth && dayType === "inspection" && "bg-teal-50/10",
                isCurrentMonth && dayType === "office" && "bg-indigo-50/10"
              )}
              onClick={() => onDayClick(day)}
            >
              <div className="flex justify-between items-start mb-1">
                <span
                  className={cn(
                    "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full transition-colors",
                    isTodayDate
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground group-hover:text-foreground",
                    !isCurrentMonth && "opacity-50"
                  )}
                >
                  {format(day, "d")}
                </span>
                {isCurrentMonth && dayType !== "off" && (
                  <div
                    className={cn(
                      "w-1.5 h-1.5 rounded-full mt-2 mr-1",
                      dayType === "inspection"
                        ? "bg-teal-500/50"
                        : "bg-indigo-500/50"
                    )}
                    title={
                      dayType === "inspection"
                        ? "Inspection Day"
                        : "Office Day"
                    }
                  />
                )}
              </div>

              <div className="space-y-1">
                {visible.map((item) =>
                  item.type === "appt" ? (
                    <AppointmentPill
                      key={item.data.id}
                      appt={item.data as CalendarAppointment}
                    />
                  ) : (
                    <TaskPill
                      key={item.data.id}
                      task={item.data as CalendarTask}
                    />
                  )
                )}
                {overflow > 0 && (
                  <div className="text-[10px] text-muted-foreground font-medium px-1">
                    +{overflow} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AppointmentPill({ appt }: { appt: CalendarAppointment }) {
  return (
    <Link
      href={`/contacts/${appt.contact.id}`}
      className="block text-xs rounded-md border bg-teal-500/10 border-teal-500/30 shadow-sm overflow-hidden hover:scale-[1.02] transition-all"
      title={appt.title}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-teal-500 text-white px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1">
        <CalendarIcon className="w-2.5 h-2.5" />
        {format(new Date(appt.startTime), "h:mm a")}
      </div>
      <div className="px-2 py-1">
        <div className="font-medium truncate">
          {appt.contact.firstName} {appt.contact.lastName}
        </div>
        <div className="text-[10px] text-muted-foreground truncate">
          {appt.type}
        </div>
      </div>
    </Link>
  );
}

function TaskPill({ task }: { task: CalendarTask }) {
  return (
    <Link
      href={`/contacts/${task.contact.id}`}
      className={cn(
        "block text-xs rounded-md border bg-muted/50 border-border/50 overflow-hidden hover:scale-[1.02] transition-all",
        task.status === "COMPLETED" && "opacity-50 line-through"
      )}
      title={task.title}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-2 py-1">
        <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
          <CheckSquare className="w-2.5 h-2.5" />
          <span className="text-[9px] uppercase tracking-wide font-medium">
            {task.taskType}
          </span>
        </div>
        <div className="font-medium truncate">
          {task.contact.firstName} {task.contact.lastName}
        </div>
      </div>
    </Link>
  );
}

/* ─────────────────────────── Day View ─────────────────────────── */

const DAY_START_HOUR = 7;
const DAY_END_HOUR = 20;
const HOURS = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR },
  (_, i) => DAY_START_HOUR + i
);

function DayView({
  day,
  dayType,
  tasks,
  appointments,
  filterMode,
}: {
  day: Date;
  dayType: string;
  tasks: CalendarTask[];
  appointments: CalendarAppointment[];
  filterMode: FilterMode;
}) {
  const showTasks = filterMode === "all" || filterMode === "tasks";
  const showAppts = filterMode === "all" || filterMode === "appointments";

  return (
    <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
      {/* Day type badge */}
      <div className="px-4 py-2 border-b flex items-center gap-2">
        <span
          className={cn(
            "w-2 h-2 rounded-full",
            dayType === "inspection"
              ? "bg-teal-500"
              : dayType === "office"
                ? "bg-indigo-500"
                : "bg-muted-foreground/30"
          )}
        />
        <span className="text-xs font-medium text-muted-foreground capitalize">
          {dayType === "off" ? "Off Day" : `${dayType} Day`}
        </span>
        {isToday(day) && (
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium ml-auto">
            Today
          </span>
        )}
      </div>

      {/* Tasks strip (non-timed) */}
      {showTasks && tasks.length > 0 && (
        <div className="px-4 py-3 border-b bg-muted/5">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Tasks ({tasks.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {tasks.map((t) => (
              <Link
                key={t.id}
                href={`/contacts/${t.contact.id}`}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-background hover:bg-muted/50 transition-colors text-sm"
              >
                <CheckSquare className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="font-medium">
                  {t.contact.firstName} {t.contact.lastName}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {t.taskType}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Timed appointments timeline */}
      {showAppts && (
        <div className="relative">
          {HOURS.map((hour) => {
            const hourAppts = appointments.filter((a) => {
              const h = new Date(a.startTime).getHours();
              return h === hour;
            });

            return (
              <div
                key={hour}
                className="flex border-b last:border-b-0 min-h-[56px]"
              >
                <div className="w-16 shrink-0 py-2 pr-3 text-right text-xs text-muted-foreground font-medium border-r">
                  {hour === 0
                    ? "12 AM"
                    : hour < 12
                      ? `${hour} AM`
                      : hour === 12
                        ? "12 PM"
                        : `${hour - 12} PM`}
                </div>
                <div className="flex-1 py-1 px-2 space-y-1">
                  {hourAppts.map((a) => (
                    <Link
                      key={a.id}
                      href={`/contacts/${a.contact.id}`}
                      className="flex items-start gap-3 px-3 py-2 rounded-lg bg-teal-500/10 border border-teal-500/30 hover:bg-teal-500/20 transition-colors"
                    >
                      <div className="shrink-0 mt-0.5">
                        {a.location ? (
                          <MapPin className="w-4 h-4 text-teal-600" />
                        ) : (
                          <Phone className="w-4 h-4 text-teal-600" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">
                            {format(new Date(a.startTime), "h:mm a")}
                          </span>
                          <span className="text-xs text-teal-700 bg-teal-500/10 px-1.5 py-0.5 rounded">
                            {a.type}
                          </span>
                        </div>
                        <div className="text-sm font-medium mt-0.5">
                          {a.contact.firstName} {a.contact.lastName}
                        </div>
                        {a.location && (
                          <div className="text-xs text-muted-foreground truncate">
                            {a.location}
                          </div>
                        )}
                        {a.description && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {a.description}
                          </div>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}

          {appointments.length === 0 && (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No appointments scheduled
            </div>
          )}
        </div>
      )}
    </div>
  );
}
