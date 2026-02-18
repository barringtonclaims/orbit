"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Clock, 
  Play, 
  Square, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Users,
  FileText,
  History
} from "lucide-react";

interface IntakeProgress {
  status: "idle" | "running" | "completed" | "error" | "cancelled";
  total: number;
  processed: number;
  leadsCreated: number;
  notesAdded: number;
  errors: string[];
  startedAt?: string;
  completedAt?: string;
  message?: string;
}

const dateRangeOptions = [
  { value: "3days", label: "Last 3 Days", description: "Quick scan" },
  { value: "1week", label: "Last Week", description: "Recent emails" },
  { value: "1month", label: "Last Month", description: "~30 days" },
  { value: "6months", label: "Last 6 Months", description: "~180 days" },
  { value: "1year", label: "Last Year", description: "~365 days" },
  { value: "2years", label: "Last 2 Years", description: "Full history" },
];

export function JoshIntake() {
  const [selectedRange, setSelectedRange] = useState<string>("");
  const [progress, setProgress] = useState<IntakeProgress>({ 
    status: "idle", 
    total: 0, 
    processed: 0, 
    leadsCreated: 0, 
    notesAdded: 0, 
    errors: [] 
  });
  const [isStarting, setIsStarting] = useState(false);

  // Poll for progress when running
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (progress.status === "running") {
      interval = setInterval(async () => {
        try {
          const response = await fetch("/api/josh/intake");
          if (response.ok) {
            const data = await response.json();
            setProgress(data);
            
            if (data.status !== "running") {
              clearInterval(interval);
            }
          }
        } catch (error) {
          console.error("Failed to fetch progress:", error);
        }
      }, 2000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [progress.status]);

  // Check for existing progress on mount
  useEffect(() => {
    const checkProgress = async () => {
      try {
        const response = await fetch("/api/josh/intake");
        if (response.ok) {
          const data = await response.json();
          if (data.status !== "idle") {
            setProgress(data);
          }
        }
      } catch (error) {
        console.error("Failed to check progress:", error);
      }
    };
    checkProgress();
  }, []);

  const startIntake = async () => {
    if (!selectedRange) return;
    
    setIsStarting(true);
    try {
      const response = await fetch("/api/josh/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ range: selectedRange }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setProgress({
          status: "running",
          total: 0,
          processed: 0,
          leadsCreated: 0,
          notesAdded: 0,
          errors: [],
        });
      } else {
        setProgress({
          ...progress,
          status: "error",
          errors: [data.error || "Failed to start intake"],
        });
      }
    } catch (error) {
      setProgress({
        ...progress,
        status: "error",
        errors: ["Failed to start intake"],
      });
    } finally {
      setIsStarting(false);
    }
  };

  const cancelIntake = async () => {
    try {
      await fetch("/api/josh/intake", { method: "DELETE" });
      setProgress({
        ...progress,
        status: "cancelled",
      });
    } catch (error) {
      console.error("Failed to cancel:", error);
    }
  };

  const resetIntake = () => {
    setProgress({
      status: "idle",
      total: 0,
      processed: 0,
      leadsCreated: 0,
      notesAdded: 0,
      errors: [],
    });
    setSelectedRange("");
  };

  const progressPercent = progress.total > 0 
    ? Math.round((progress.processed / progress.total) * 100) 
    : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-primary" />
          <CardTitle>Email Intake</CardTitle>
        </div>
        <CardDescription>
          Let Josh scan your past AccuLynx emails and automatically import leads and activity history.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {progress.status === "idle" && (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">How far back should Josh look?</label>
              <Select value={selectedRange} onValueChange={setSelectedRange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select time range..." />
                </SelectTrigger>
                <SelectContent>
                  {dateRangeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center justify-between gap-4">
                        <span>{option.label}</span>
                        <span className="text-xs text-muted-foreground">{option.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
              <p className="font-medium">What Josh will do:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Find all AccuLynx emails in the selected time range</li>
                <li>Create new leads for any customers not in your database</li>
                <li>Backdate leads to when they were originally received</li>
                <li>Add all AccuLynx notifications to the correct lead&apos;s timeline</li>
                <li>Skip any emails that have already been processed</li>
              </ul>
            </div>

            <Button 
              onClick={startIntake} 
              disabled={!selectedRange || isStarting}
              className="w-full gap-2"
            >
              {isStarting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Start Intake
                </>
              )}
            </Button>
          </>
        )}

        {progress.status === "running" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="font-medium">Processing emails...</span>
              </div>
              <Badge variant="secondary">
                {progress.processed} / {progress.total || "?"}
              </Badge>
            </div>

            <Progress value={progressPercent} className="h-2" />

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-green-500" />
                <span>{progress.leadsCreated} leads created</span>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-500" />
                <span>{progress.notesAdded} notes added</span>
              </div>
            </div>

            <Button 
              variant="outline" 
              onClick={cancelIntake}
              className="w-full gap-2"
            >
              <Square className="w-4 h-4" />
              Cancel Intake
            </Button>
          </div>
        )}

        {progress.status === "completed" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">Intake Complete!</span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm bg-green-50 dark:bg-green-950/20 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-green-600" />
                <span><strong>{progress.leadsCreated}</strong> leads created</span>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-green-600" />
                <span><strong>{progress.notesAdded}</strong> notes added</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span>{progress.processed} emails processed</span>
              </div>
            </div>

            {progress.errors.length > 0 && (
              <div className="text-sm text-amber-600">
                <p className="font-medium">{progress.errors.length} warning(s):</p>
                <ul className="list-disc list-inside">
                  {progress.errors.slice(0, 3).map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                  {progress.errors.length > 3 && (
                    <li>...and {progress.errors.length - 3} more</li>
                  )}
                </ul>
              </div>
            )}

            <Button 
              variant="outline" 
              onClick={resetIntake}
              className="w-full"
            >
              Run Another Intake
            </Button>
          </div>
        )}

        {(progress.status === "error" || progress.status === "cancelled") && (
          <div className="space-y-4">
            <div className={`flex items-center gap-2 ${progress.status === "error" ? "text-red-600" : "text-amber-600"}`}>
              <AlertCircle className="w-5 h-5" />
              <span className="font-medium">
                {progress.status === "error" ? "Intake Failed" : "Intake Cancelled"}
              </span>
            </div>

            {progress.errors.length > 0 && (
              <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/20 rounded-lg p-4">
                {progress.errors.map((error, i) => (
                  <p key={i}>{error}</p>
                ))}
              </div>
            )}

            {(progress.leadsCreated > 0 || progress.notesAdded > 0) && (
              <div className="text-sm text-muted-foreground">
                <p>Before {progress.status === "error" ? "failing" : "cancelling"}:</p>
                <p>{progress.leadsCreated} leads created, {progress.notesAdded} notes added</p>
              </div>
            )}

            <Button 
              variant="outline" 
              onClick={resetIntake}
              className="w-full"
            >
              Try Again
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

