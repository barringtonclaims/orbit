"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { scheduleAppointment, markAsApproved, markAsSeasonalFollowUp } from "@/lib/actions/appointments";
import { SMSComposer } from "@/components/messaging/sms-composer";
import { format, addMonths } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Calendar as CalendarIcon,
  MessageSquare,
  CheckCircle2,
  Clock,
  Loader2,
  Send,
  ThumbsUp,
  Snowflake,
} from "lucide-react";

interface WorkflowActionsProps {
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
    stage: {
      id: string;
      name: string;
      stageType: string;
    } | null;
  };
  currentTask?: {
    id: string;
    taskType: string;
  } | null;
  inspectionDays?: number[];
}

export function WorkflowActions({ contact, currentTask, inspectionDays = [2, 4] }: WorkflowActionsProps) {
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showSeasonalDialog, setShowSeasonalDialog] = useState(false);
  const [showSMSComposer, setShowSMSComposer] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Schedule appointment state
  const [appointmentDate, setAppointmentDate] = useState<Date>();
  const [appointmentTime, setAppointmentTime] = useState("10:00");
  const [appointmentNotes, setAppointmentNotes] = useState("");

  // Seasonal follow-up state
  const [seasonalDate, setSeasonalDate] = useState<Date>(addMonths(new Date(), 3));
  const [seasonalNotes, setSeasonalNotes] = useState("");

  // Approval notes
  const [approvalNotes, setApprovalNotes] = useState("");

  const handleSendFirstMessage = () => {
    if (!contact.phone) {
      toast.error("No phone number available");
      return;
    }
    setShowSMSComposer(true);
  };

  const handleScheduleAppointment = async () => {
    if (!appointmentDate) {
      toast.error("Please select a date");
      return;
    }

    setIsLoading(true);

    try {
      const result = await scheduleAppointment({
        contactId: contact.id,
        appointmentDate,
        appointmentTime,
        notes: appointmentNotes,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Appointment scheduled!");
      setShowScheduleDialog(false);
      setAppointmentDate(undefined);
      setAppointmentTime("10:00");
      setAppointmentNotes("");
    } catch {
      toast.error("Failed to schedule appointment");
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkApproved = async () => {
    setIsLoading(true);

    try {
      const result = await markAsApproved(contact.id, approvalNotes);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Lead marked as approved! 🎉");
      setShowApproveDialog(false);
      setApprovalNotes("");
    } catch {
      toast.error("Failed to mark as approved");
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkSeasonal = async () => {
    setIsLoading(true);

    try {
      const result = await markAsSeasonalFollowUp(contact.id, seasonalDate, seasonalNotes);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Moved to seasonal follow-up");
      setShowSeasonalDialog(false);
      setSeasonalNotes("");
    } catch {
      toast.error("Failed to update");
    } finally {
      setIsLoading(false);
    }
  };

  // Determine which actions to show based on current stage
  const stageName = contact.stage?.name?.toLowerCase() || "";
  const stageType = contact.stage?.stageType || "ACTIVE";
  const taskType = currentTask?.taskType;

  const showFirstMessageAction = 
    (stageName.includes("new") || taskType === "FIRST_MESSAGE") && contact.phone;
  
  const showScheduleAction = 
    !stageName.includes("approved") && 
    !stageName.includes("not interested") &&
    stageType === "ACTIVE";
  
  const showApproveAction = stageType === "ACTIVE";
  const showSeasonalAction = stageType === "ACTIVE";

  // If terminal stage, show limited actions
  if (stageType !== "ACTIVE") {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Status</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This lead is marked as{" "}
            <strong>{contact.stage?.name}</strong>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {showFirstMessageAction && (
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={handleSendFirstMessage}
            >
              <MessageSquare className="w-4 h-4" />
              Send First Message
            </Button>
          )}

          {showScheduleAction && (
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => setShowScheduleDialog(true)}
            >
              <CalendarIcon className="w-4 h-4" />
              Schedule Inspection
            </Button>
          )}

          {showApproveAction && (
            <Button
              variant="outline"
              className="w-full justify-start gap-2 text-green-600 hover:text-green-700 hover:bg-green-50"
              onClick={() => setShowApproveDialog(true)}
            >
              <ThumbsUp className="w-4 h-4" />
              Mark as Approved
            </Button>
          )}

          {showSeasonalAction && (
            <Button
              variant="outline"
              className="w-full justify-start gap-2 text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50"
              onClick={() => setShowSeasonalDialog(true)}
            >
              <Snowflake className="w-4 h-4" />
              Seasonal Follow-up
            </Button>
          )}
        </CardContent>
      </Card>

      {/* SMS Composer */}
      {contact.phone && (
        <SMSComposer
          open={showSMSComposer}
          onOpenChange={setShowSMSComposer}
          contact={{
            id: contact.id,
            firstName: contact.firstName,
            lastName: contact.lastName,
            phone: contact.phone,
          }}
          inspectionDays={inspectionDays}
        />
      )}

      {/* Schedule Appointment Dialog */}
      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Inspection</DialogTitle>
            <DialogDescription>
              Set a date and time for the inspection with {contact.firstName} {contact.lastName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !appointmentDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {appointmentDate ? format(appointmentDate, "PPP") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={appointmentDate}
                    onSelect={setAppointmentDate}
                    initialFocus
                    disabled={(date) => date < new Date()}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Time</Label>
              <Select value={appointmentTime} onValueChange={setAppointmentTime}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 20 }, (_, i) => {
                    const hour = Math.floor(i / 2) + 8;
                    const minute = i % 2 === 0 ? "00" : "30";
                    const time = `${hour.toString().padStart(2, "0")}:${minute}`;
                    const displayTime = format(new Date(`2000-01-01T${time}`), "h:mm a");
                    return (
                      <SelectItem key={time} value={time}>
                        {displayTime}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={appointmentNotes}
                onChange={(e) => setAppointmentNotes(e.target.value)}
                placeholder="Any notes about this appointment..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScheduleDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleScheduleAppointment} disabled={isLoading || !appointmentDate}>
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Schedule"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Approved</DialogTitle>
            <DialogDescription>
              Congratulations! This will mark {contact.firstName} {contact.lastName} as an approved lead.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                placeholder="Any notes about this approval..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleMarkApproved} disabled={isLoading} className="bg-green-600 hover:bg-green-700">
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Approve
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Seasonal Follow-up Dialog */}
      <Dialog open={showSeasonalDialog} onOpenChange={setShowSeasonalDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Seasonal Follow-up</DialogTitle>
            <DialogDescription>
              Push this lead to a future date for seasonal follow-up.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Follow-up Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(seasonalDate, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={seasonalDate}
                    onSelect={(date) => date && setSeasonalDate(date)}
                    initialFocus
                    disabled={(date) => date < new Date()}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={seasonalNotes}
                onChange={(e) => setSeasonalNotes(e.target.value)}
                placeholder="Why are we following up later..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSeasonalDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleMarkSeasonal} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Clock className="w-4 h-4 mr-2" />
                  Set Follow-up
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
