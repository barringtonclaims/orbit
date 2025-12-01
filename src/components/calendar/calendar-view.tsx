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
  getDay
} from "date-fns";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface CalendarEvent {
  id: string;
  title: string;
  dueDate: Date;
  taskType: string;
  status: string;
  isAppointment: boolean;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

interface CalendarViewProps {
  events: CalendarEvent[];
  settings: {
    officeDays: number[];
    inspectionDays: number[];
  };
}

export function CalendarView({ events, settings }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth)),
    end: endOfWeek(endOfMonth(currentMonth)),
  });

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const goToToday = () => setCurrentMonth(new Date());

  const getDayType = (day: Date) => {
    const dayOfWeek = getDay(day);
    if (settings.inspectionDays.includes(dayOfWeek)) return "inspection";
    if (settings.officeDays.includes(dayOfWeek)) return "office";
    return "off";
  };

  const getEventsForDay = (day: Date) => {
    return events.filter(event => isSameDay(new Date(event.dueDate), day));
  };

  return (
    <div className="space-y-4 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card p-4 rounded-xl border shadow-sm">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold w-40">
            {format(currentMonth, "MMMM yyyy")}
          </h2>
          <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
            <Button variant="ghost" size="icon" onClick={prevMonth} className="h-7 w-7">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={goToToday} className="h-7 text-xs px-3 font-normal">
              Today
            </Button>
            <Button variant="ghost" size="icon" onClick={nextMonth} className="h-7 w-7">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-500"></div>
            <span className="text-muted-foreground">Office Day</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-teal-500"></div>
            <span className="text-muted-foreground">Inspection Day</span>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-card rounded-xl border shadow-sm overflow-hidden w-full">
        {/* Weekday Headers */}
        <div 
          className="grid border-b bg-muted/30"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}
        >
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {day}
            </div>
          ))}
        </div>

        <div 
          className="grid auto-rows-fr bg-muted/20 gap-px"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}
        >
          {days.map((day, dayIdx) => {
            const dayType = getDayType(day);
            const dayEvents = getEventsForDay(day);
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isTodayDate = isToday(day);

            return (
              <div
                key={day.toString()}
                className={cn(
                  "min-h-[140px] bg-background p-2 transition-all relative group",
                  !isCurrentMonth && "bg-muted/5 text-muted-foreground/50",
                  // Day type indicators (subtle background tint)
                  isCurrentMonth && dayType === "inspection" && "bg-teal-50/10",
                  isCurrentMonth && dayType === "office" && "bg-indigo-50/10",
                )}
              >
                {/* Day Header */}
                <div className="flex justify-between items-start mb-2">
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
                  
                  {/* Day Type Dot */}
                  {isCurrentMonth && dayType !== "off" && (
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full mt-2 mr-1",
                      dayType === "inspection" ? "bg-teal-500/50" : "bg-indigo-500/50"
                    )} title={dayType === "inspection" ? "Inspection Day" : "Office Day"} />
                  )}
                </div>

                {/* Events */}
                <div className="space-y-1.5">
                  {dayEvents.map((event) => (
                    <Link 
                      key={event.id} 
                      href={`/contacts/${event.contact.id}`}
                      className={cn(
                        "block text-xs px-2 py-1.5 rounded-md border truncate shadow-sm transition-all hover:scale-[1.02] hover:shadow-md",
                        event.isAppointment 
                          ? "bg-teal-50 border-teal-200 text-teal-700 dark:bg-teal-900/30 dark:border-teal-800 dark:text-teal-300"
                          : "bg-white border-gray-100 text-gray-600 dark:bg-zinc-800/50 dark:border-zinc-700 dark:text-zinc-400",
                        event.status === "COMPLETED" && "opacity-60 line-through grayscale"
                      )}
                      title={event.title}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {event.isAppointment ? (
                          <CalendarIcon className="w-3 h-3 shrink-0 opacity-70" />
                        ) : (
                          <CheckSquare className="w-3 h-3 shrink-0 opacity-70" />
                        )}
                        <span className="font-semibold text-[10px] uppercase tracking-wide opacity-80">
                          {event.isAppointment ? format(new Date(event.dueDate), "h:mm a") : "Task"}
                        </span>
                      </div>
                      <div className="truncate font-medium">
                        {event.contact.firstName} {event.contact.lastName}
                      </div>
                      <div className="truncate text-[10px] opacity-80">
                        {event.title.split(" - ").pop()}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
