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
  appointmentTime: Date | null;
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
    return events
      .filter(event => {
        // For appointments, use appointmentTime if available
        const eventDate = event.isAppointment && event.appointmentTime 
          ? new Date(event.appointmentTime)
          : new Date(event.dueDate);
        return isSameDay(eventDate, day);
      })
      .sort((a, b) => {
        // Sort by time - appointments with times first, then by time
        const aTime = a.appointmentTime ? new Date(a.appointmentTime).getTime() : (a.isAppointment ? 0 : Infinity);
        const bTime = b.appointmentTime ? new Date(b.appointmentTime).getTime() : (b.isAppointment ? 0 : Infinity);
        return aTime - bTime;
      });
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
                        "block text-xs rounded-md border transition-all hover:scale-[1.02] hover:shadow-md overflow-hidden",
                        event.isAppointment 
                          ? "bg-teal-500/10 border-teal-500/30 shadow-sm"
                          : "bg-muted/50 border-border/50",
                        event.status === "COMPLETED" && "opacity-50 line-through"
                      )}
                      title={event.title}
                    >
                      {/* Time badge for appointments */}
                      {event.isAppointment && event.appointmentTime && (
                        <div className="bg-teal-500 text-white px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1">
                          <CalendarIcon className="w-2.5 h-2.5" />
                          {format(new Date(event.appointmentTime), "h:mm a")}
                        </div>
                      )}
                      <div className="px-2 py-1.5">
                        {!event.isAppointment && (
                          <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
                            <CheckSquare className="w-2.5 h-2.5" />
                            <span className="text-[9px] uppercase tracking-wide font-medium">Task</span>
                          </div>
                        )}
                        <div className="font-medium truncate">
                          {event.contact.firstName} {event.contact.lastName}
                        </div>
                        {event.isAppointment && (
                          <div className="text-[10px] text-muted-foreground truncate">
                            Inspection
                          </div>
                        )}
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
