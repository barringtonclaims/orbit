import { getCalendarEvents } from "@/lib/actions/calendar";
import { CalendarView } from "@/components/calendar/calendar-view";
import { Card } from "@/components/ui/card";

export const metadata = {
  title: "Calendar",
};

export default async function CalendarPage() {
  const { data } = await getCalendarEvents();

  if (!data) {
    return (
      <div className="p-6">
        <Card className="p-12 text-center text-muted-foreground">
          Failed to load calendar. Please try again.
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Calendar</h1>
        <p className="text-muted-foreground mt-1">
          Manage your schedule, tasks, and inspections
        </p>
      </div>

      <CalendarView 
        tasks={data.tasks} 
        appointments={data.appointments}
        settings={data.settings} 
      />
    </div>
  );
}


