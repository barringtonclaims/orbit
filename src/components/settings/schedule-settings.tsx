"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { updateOrganizationSettings } from "@/lib/actions/organizations";
import { Loader2 } from "lucide-react";

const DAYS = [
  { id: 1, label: "Monday" },
  { id: 2, label: "Tuesday" },
  { id: 3, label: "Wednesday" },
  { id: 4, label: "Thursday" },
  { id: 5, label: "Friday" },
  { id: 6, label: "Saturday" },
  { id: 0, label: "Sunday" },
];

interface ScheduleSettingsProps {
  initialOfficeDays: number[];
  initialInspectionDays: number[];
}

export function ScheduleSettings({ 
  initialOfficeDays = [1, 3, 5], 
  initialInspectionDays = [2, 4] 
}: ScheduleSettingsProps) {
  const [officeDays, setOfficeDays] = useState<number[]>(initialOfficeDays);
  const [inspectionDays, setInspectionDays] = useState<number[]>(initialInspectionDays);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await updateOrganizationSettings({
        officeDays,
        inspectionDays,
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedule Configuration</CardTitle>
        <CardDescription>Define your Office Days and Inspection Days.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <Label className="text-base mb-4 block">Office Days (Tasks)</Label>
            <div className="space-y-3">
              {DAYS.map(day => (
                <div key={`office-${day.id}`} className="flex items-center justify-between">
                  <span className="text-sm">{day.label}</span>
                  <Switch 
                    checked={officeDays.includes(day.id)}
                    onCheckedChange={() => toggleDay(day.id, "office")}
                  />
                </div>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-base mb-4 block">Inspection Days</Label>
            <div className="space-y-3">
              {DAYS.map(day => (
                <div key={`insp-${day.id}`} className="flex items-center justify-between">
                  <span className="text-sm">{day.label}</span>
                  <Switch 
                    checked={inspectionDays.includes(day.id)}
                    onCheckedChange={() => toggleDay(day.id, "inspection")}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end pt-4">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Save Changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

