"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { updateOrganizationSettings } from "@/lib/actions/organizations";
import { Loader2, Calendar, Briefcase, ClipboardCheck, Snowflake } from "lucide-react";

const DAYS = [
  { id: 1, label: "Monday", short: "Mon" },
  { id: 2, label: "Tuesday", short: "Tue" },
  { id: 3, label: "Wednesday", short: "Wed" },
  { id: 4, label: "Thursday", short: "Thu" },
  { id: 5, label: "Friday", short: "Fri" },
  { id: 6, label: "Saturday", short: "Sat" },
  { id: 0, label: "Sunday", short: "Sun" },
];

const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

interface ScheduleSettingsProps {
  initialOfficeDays: number[];
  initialInspectionDays: number[];
  initialSeasonalMonth?: number | null;
  initialSeasonalDay?: number | null;
}

export function ScheduleSettings({ 
  initialOfficeDays = [1, 3, 5], 
  initialInspectionDays = [2, 4],
  initialSeasonalMonth = 4,
  initialSeasonalDay = 1,
}: ScheduleSettingsProps) {
  const [officeDays, setOfficeDays] = useState<number[]>(initialOfficeDays);
  const [inspectionDays, setInspectionDays] = useState<number[]>(initialInspectionDays);
  const [seasonalMonth, setSeasonalMonth] = useState<number>(initialSeasonalMonth || 4);
  const [seasonalDay, setSeasonalDay] = useState<number>(initialSeasonalDay || 1);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await updateOrganizationSettings({
        officeDays,
        inspectionDays,
        seasonalFollowUpMonth: seasonalMonth,
        seasonalFollowUpDay: seasonalDay,
      });
      if (result.error) throw new Error(result.error);
      toast.success("Schedule settings updated");
    } catch (error) {
      toast.error("Failed to update settings");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleDay = (day: number, type: "office" | "inspection") => {
    if (type === "office") {
      setOfficeDays(prev => 
        prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
      );
    } else {
      setInspectionDays(prev => 
        prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
      );
    }
  };

  // Generate days for selected month
  const getDaysInMonth = (month: number) => {
    // Use 2024 as a leap year to get Feb 29
    const days = new Date(2024, month, 0).getDate();
    return Array.from({ length: days }, (_, i) => i + 1);
  };

  return (
    <div className="space-y-6">
      {/* Weekly Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Weekly Schedule
          </CardTitle>
          <CardDescription>
            Configure which days are office days (for tasks) and inspection days (for appointments).
            Tasks can only be scheduled on office days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Table Header */}
          <div className="grid grid-cols-3 gap-4 pb-3 border-b mb-2">
            <div className="font-medium text-sm text-muted-foreground">Day</div>
            <div className="font-medium text-sm text-muted-foreground text-center flex items-center justify-center gap-1">
              <Briefcase className="w-4 h-4" />
              Office Day
            </div>
            <div className="font-medium text-sm text-muted-foreground text-center flex items-center justify-center gap-1">
              <ClipboardCheck className="w-4 h-4" />
              Inspection Day
            </div>
          </div>
          
          {/* Day Rows */}
          <div className="space-y-1">
            {DAYS.map(day => (
              <div 
                key={day.id} 
                className="grid grid-cols-3 gap-4 py-2.5 hover:bg-muted/50 rounded-lg px-2 -mx-2"
              >
                <div className="flex items-center">
                  <span className="font-medium">{day.label}</span>
                </div>
                <div className="flex items-center justify-center">
                  <Switch 
                    checked={officeDays.includes(day.id)}
                    onCheckedChange={() => toggleDay(day.id, "office")}
                  />
                </div>
                <div className="flex items-center justify-center">
                  <Switch 
                    checked={inspectionDays.includes(day.id)}
                    onCheckedChange={() => toggleDay(day.id, "inspection")}
                  />
                </div>
              </div>
            ))}
          </div>
          
          {/* Summary */}
          <div className="mt-4 pt-4 border-t text-sm text-muted-foreground">
            <p>
              <strong>Office Days:</strong>{" "}
              {officeDays.length > 0 
                ? DAYS.filter(d => officeDays.includes(d.id)).map(d => d.short).join(", ")
                : "None selected"}
            </p>
            <p className="mt-1">
              <strong>Inspection Days:</strong>{" "}
              {inspectionDays.length > 0 
                ? DAYS.filter(d => inspectionDays.includes(d.id)).map(d => d.short).join(", ")
                : "None selected"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Seasonal Follow-Up Date */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Snowflake className="w-5 h-5" />
            Seasonal Follow-Up Date
          </CardTitle>
          <CardDescription>
            When customers are marked as &quot;Seasonal Follow-Up&quot;, they will automatically 
            get a task scheduled for this date each year.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="space-y-2">
              <Label>Month</Label>
              <Select 
                value={seasonalMonth.toString()} 
                onValueChange={(v) => setSeasonalMonth(parseInt(v))}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map(month => (
                    <SelectItem key={month.value} value={month.value.toString()}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Day</Label>
              <Select 
                value={seasonalDay.toString()} 
                onValueChange={(v) => setSeasonalDay(parseInt(v))}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getDaysInMonth(seasonalMonth).map(day => (
                    <SelectItem key={day} value={day.toString()}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            Currently set to: <strong>{MONTHS.find(m => m.value === seasonalMonth)?.label} {seasonalDay}</strong>
          </p>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          Save Schedule Settings
        </Button>
      </div>
    </div>
  );
}
