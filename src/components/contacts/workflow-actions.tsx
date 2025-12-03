"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
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
import { TemplateSelector } from "@/components/templates/template-selector";
import { composeSMSUrl, composeEmailUrl } from "@/lib/messaging";
import { type TemplateContext } from "@/lib/templates";
import { updateContact } from "@/lib/actions/contacts";
import {
  transitionToScheduledInspection,
  transitionAfterInspection,
  markFirstMessageSent,
  rescheduleFirstMessageFollowUp,
  markQuoteSent,
  markClaimRecSent,
  markPASent,
  transitionToTerminal,
  rescheduleFollowUp,
  updateJobStatus,
} from "@/lib/workflow-engine";
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
  FileText,
  ClipboardCheck,
  XCircle,
  Mail,
  Upload,
  Briefcase,
  Home,
  Shield,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { STAGE_NAMES } from "@/types";

interface WorkflowActionsProps {
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    carrier: string | null;
    dateOfLoss: Date | null;
    policyNumber: string | null;
    claimNumber: string | null;
    quoteType: string | null;
    jobStatus: string | null;
    // Workflow state tracking
    firstMessageSentAt: Date | null;
    quoteSentAt: Date | null;
    claimRecSentAt: Date | null;
    paSentAt: Date | null;
    stage: {
      id: string;
      name: string;
      stageType: string;
      workflowType: string;
    } | null;
  };
  currentTask?: {
    id: string;
    taskType: string;
    actionButton: string | null;
    appointmentTime?: Date | null;
  } | null;
  inspectionDays?: number[];
  onRefresh?: () => void;
}

export function WorkflowActions({ 
  contact, 
  currentTask, 
  inspectionDays = [2, 4],
  onRefresh 
}: WorkflowActionsProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  // Dialog states
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showAssignStatusDialog, setShowAssignStatusDialog] = useState(false);
  const [showQuoteDialog, setShowQuoteDialog] = useState(false);
  const [showClaimRecDialog, setShowClaimRecDialog] = useState(false);
  const [showClaimInfoDialog, setShowClaimInfoDialog] = useState(false);
  const [showEditClaimInfoDialog, setShowEditClaimInfoDialog] = useState(false);
  const [showPADialog, setShowPADialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showSeasonalDialog, setShowSeasonalDialog] = useState(false);
  const [showNotInterestedDialog, setShowNotInterestedDialog] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  
  // Pending action after claim info is collected
  const [pendingClaimAction, setPendingClaimAction] = useState<(() => void) | null>(null);

  // Template selector config
  const [templateConfig, setTemplateConfig] = useState<{
    category: string;
    preferredType: "sms" | "email";
    title: string;
    onComplete?: () => void;
  } | null>(null);

  // Form states
  const [appointmentDate, setAppointmentDate] = useState<Date>();
  const [appointmentTime, setAppointmentTime] = useState("10:00");
  const [appointmentNotes, setAppointmentNotes] = useState("");
  
  const [assignType, setAssignType] = useState<"retail" | "claim">("retail");
  const [quoteType, setQuoteType] = useState("");
  const [assignNotes, setAssignNotes] = useState("");
  
  const [carrier, setCarrier] = useState(contact.carrier || "");
  const [dateOfLoss, setDateOfLoss] = useState<Date | undefined>(
    contact.dateOfLoss ? new Date(contact.dateOfLoss) : undefined
  );
  const [policyNumber, setPolicyNumber] = useState(contact.policyNumber || "");
  const [claimNumber, setClaimNumber] = useState(contact.claimNumber || "");
  
  const [notes, setNotes] = useState("");
  
  // Check if required claim info is missing
  const isClaimInfoMissing = !contact.carrier || !contact.dateOfLoss;
  const [seasonalDate, setSeasonalDate] = useState<Date>(addMonths(new Date(), 3));

  // Current stage info
  const stageName = contact.stage?.name || "";
  const stageType = contact.stage?.stageType || "ACTIVE";
  const workflowType = contact.stage?.workflowType || "BOTH";
  const taskType = currentTask?.taskType;
  const actionButton = currentTask?.actionButton;

  // Build template context - use state values for claim info if available (may have just been entered)
  const templateContext: TemplateContext = {
    contact: {
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.phone,
      address: contact.address,
      city: contact.city,
      state: contact.state,
      zipCode: contact.zipCode,
      carrier: carrier || contact.carrier,
      dateOfLoss: dateOfLoss || contact.dateOfLoss,
      policyNumber: policyNumber || contact.policyNumber,
      claimNumber: claimNumber || contact.claimNumber,
      quoteType: contact.quoteType,
    },
  };

  // ============================================
  // ACTION HANDLERS
  // ============================================

  const handleOpenTemplate = (config: {
    category: string;
    preferredType: "sms" | "email";
    title: string;
    onComplete?: () => void;
  }) => {
    setTemplateConfig(config);
    setShowTemplateSelector(true);
  };

  const handleTemplateSelect = (message: string, type: "sms" | "email", subject?: string) => {
    if (type === "sms" && contact.phone) {
      const url = composeSMSUrl(contact.phone, message);
      window.location.href = url;
    } else if (type === "email" && contact.email) {
      const url = composeEmailUrl(contact.email, subject || "", message);
      window.location.href = url;
    } else {
      // Copy to clipboard as fallback
      navigator.clipboard.writeText(message);
      toast.success("Message copied to clipboard");
    }
    
    // Call completion handler if provided
    templateConfig?.onComplete?.();
  };

  const handleScheduleInspection = async () => {
    if (!appointmentDate) {
      toast.error("Please select a date");
      return;
    }

    setIsLoading(true);
    try {
      const appointmentDateTime = new Date(appointmentDate);
      const [hours, minutes] = appointmentTime.split(":").map(Number);
      appointmentDateTime.setHours(hours, minutes, 0, 0);

      const result = await transitionToScheduledInspection(
        contact.id,
        appointmentDateTime,
        appointmentNotes
      );

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Inspection scheduled!");
      setShowScheduleDialog(false);
      resetScheduleForm();
      router.refresh();
    } catch {
      toast.error("Failed to schedule inspection");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssignStatus = async () => {
    if (assignType === "retail" && !quoteType) {
      toast.error("Please specify the quote type");
      return;
    }

    if (assignType === "claim" && (!carrier || !dateOfLoss)) {
      toast.error("Please enter carrier and date of loss");
      return;
    }

    setIsLoading(true);
    try {
      const result = await transitionAfterInspection(
        contact.id,
        assignType,
        assignNotes,
        {
          quoteType: assignType === "retail" ? quoteType : undefined,
          carrier: assignType === "claim" ? carrier : undefined,
          dateOfLoss: assignType === "claim" ? dateOfLoss : undefined,
        }
      );

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(`Contact assigned to ${assignType === "retail" ? "Retail" : "Claim"} Prospect`);
      setShowAssignStatusDialog(false);
      resetAssignForm();
      router.refresh();
    } catch {
      toast.error("Failed to assign status");
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkQuoteSent = async () => {
    setIsLoading(true);
    try {
      const result = await markQuoteSent(contact.id, contact.quoteType || quoteType);
      
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Quote marked as sent - follow-up scheduled");
      setShowQuoteDialog(false);
      router.refresh();
    } catch {
      toast.error("Failed to mark quote sent");
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkClaimRecSent = async () => {
    if (!carrier || !dateOfLoss) {
      toast.error("Please enter carrier and date of loss");
      return;
    }

    setIsLoading(true);
    try {
      const result = await markClaimRecSent(contact.id, carrier, dateOfLoss);
      
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Claim recommendation marked as sent");
      setShowClaimRecDialog(false);
      router.refresh();
    } catch {
      toast.error("Failed to mark claim rec sent");
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkPASent = async () => {
    setIsLoading(true);
    try {
      const result = await markPASent(contact.id);
      
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("PA Agreement marked as sent");
      setShowPADialog(false);
      router.refresh();
    } catch {
      toast.error("Failed to mark PA sent");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTerminalStatus = async (status: "approved" | "seasonal" | "not_interested") => {
    setIsLoading(true);
    try {
      const result = await transitionToTerminal(contact.id, status, notes);
      
      if (result.error) {
        toast.error(result.error);
        return;
      }

      const messages = {
        approved: "Job approved! 🎉",
        seasonal: "Moved to seasonal follow-up",
        not_interested: "Marked as not interested",
      };

      toast.success(messages[status]);
      setShowApproveDialog(false);
      setShowSeasonalDialog(false);
      setShowNotInterestedDialog(false);
      setNotes("");
      router.refresh();
    } catch {
      toast.error("Failed to update status");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRescheduleFollowUp = async () => {
    if (!currentTask?.id) return;
    
    setIsLoading(true);
    try {
      const result = await rescheduleFollowUp(currentTask.id);
      
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Follow-up rescheduled");
      router.refresh();
    } catch {
      toast.error("Failed to reschedule");
    } finally {
      setIsLoading(false);
    }
  };

  const handleJobStatusUpdate = async (newStatus: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED") => {
    setIsLoading(true);
    try {
      const result = await updateJobStatus(contact.id, newStatus);
      
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(`Job marked as ${newStatus.toLowerCase().replace("_", " ")}`);
      router.refresh();
    } catch {
      toast.error("Failed to update job status");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle saving claim info and then proceeding with pending action
  const handleSaveClaimInfo = async () => {
    if (!carrier || !dateOfLoss) {
      toast.error("Carrier and Date of Loss are required");
      return;
    }

    setIsLoading(true);
    try {
      const result = await updateContact(contact.id, {
        carrier,
        dateOfLoss: dateOfLoss.toISOString(),
        policyNumber: policyNumber || undefined,
        claimNumber: claimNumber || undefined,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Claim info saved");
      setShowClaimInfoDialog(false);
      router.refresh();

      // Execute pending action after claim info is saved
      if (pendingClaimAction) {
        // Small delay to allow state to update
        setTimeout(() => {
          pendingClaimAction();
          setPendingClaimAction(null);
        }, 100);
      }
    } catch {
      toast.error("Failed to save claim info");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle editing existing claim info
  const handleUpdateClaimInfo = async () => {
    setIsLoading(true);
    try {
      const result = await updateContact(contact.id, {
        carrier: carrier || undefined,
        dateOfLoss: dateOfLoss ? dateOfLoss.toISOString() : undefined,
        policyNumber: policyNumber || undefined,
        claimNumber: claimNumber || undefined,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Claim info updated");
      setShowEditClaimInfoDialog(false);
      router.refresh();
    } catch {
      toast.error("Failed to update claim info");
    } finally {
      setIsLoading(false);
    }
  };

  // Check claim info and show dialog if needed before proceeding
  const requireClaimInfo = (action: () => void) => {
    if (isClaimInfoMissing) {
      setPendingClaimAction(() => action);
      setShowClaimInfoDialog(true);
    } else {
      action();
    }
  };

  // Form reset helpers
  const resetScheduleForm = () => {
    setAppointmentDate(undefined);
    setAppointmentTime("10:00");
    setAppointmentNotes("");
  };

  const resetAssignForm = () => {
    setAssignType("retail");
    setQuoteType("");
    setCarrier("");
    setDateOfLoss(undefined);
    setAssignNotes("");
  };

  // ============================================
  // RENDER LOGIC
  // ============================================

  // Terminal stages show limited actions
  if (stageType === "APPROVED") {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-green-600" />
            Job Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant={contact.jobStatus === "COMPLETED" ? "default" : "secondary"}>
              {contact.jobStatus || "SCHEDULED"}
            </Badge>
          </div>
          
          <div className="flex flex-col gap-2">
            {contact.jobStatus !== "IN_PROGRESS" && contact.jobStatus !== "COMPLETED" && (
              <Button
                variant="outline"
                size="sm"
                className="justify-start gap-2"
                onClick={() => handleJobStatusUpdate("IN_PROGRESS")}
                disabled={isLoading}
              >
                <ArrowRight className="w-4 h-4" />
                Start Job
              </Button>
            )}
            {contact.jobStatus === "IN_PROGRESS" && (
              <Button
                variant="outline"
                size="sm"
                className="justify-start gap-2 text-green-600"
                onClick={() => handleJobStatusUpdate("COMPLETED")}
                disabled={isLoading}
              >
                <CheckCircle2 className="w-4 h-4" />
                Mark Complete
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (stageType === "SEASONAL" || stageType === "NOT_INTERESTED") {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Status</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This contact is marked as <strong>{contact.stage?.name}</strong>
          </p>
        </CardContent>
      </Card>
    );
  }

  // Handler for marking first message as sent
  const handleMarkFirstMessageSent = async () => {
    setIsLoading(true);
    try {
      const result = await markFirstMessageSent(contact.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("First message sent - follow-up scheduled");
      router.refresh();
    } catch {
      toast.error("Failed to mark message sent");
    } finally {
      setIsLoading(false);
    }
  };

  // Handler for first message follow-up reschedule
  const handleFirstMessageFollowUp = async () => {
    if (!currentTask?.id) return;
    setIsLoading(true);
    try {
      const result = await rescheduleFirstMessageFollowUp(currentTask.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Follow-up sent and rescheduled");
      router.refresh();
    } catch {
      toast.error("Failed to reschedule");
    } finally {
      setIsLoading(false);
    }
  };

  // Check if appointment is in the past
  const isAppointmentPast = currentTask?.appointmentTime 
    ? new Date(currentTask.appointmentTime) < new Date() 
    : false;

  // Determine primary action based on stage, task, and workflow state
  const getPrimaryAction = () => {
    // ============================================
    // NEW LEAD STAGE
    // ============================================
    if (stageName === STAGE_NAMES.NEW_LEAD) {
      // First Message Follow-Up (after first message was sent)
      if (taskType === "FIRST_MESSAGE_FOLLOW_UP" || contact.firstMessageSentAt) {
        return {
          label: "Send Follow Up",
          icon: RefreshCw,
          variant: "default" as const,
          onClick: () => handleOpenTemplate({
            category: "FIRST_MESSAGE_FOLLOW_UP",
            preferredType: "sms",
            title: "First Message Follow Up",
            onComplete: handleFirstMessageFollowUp,
          }),
          disabled: !contact.phone,
        };
      }
      
      // First Message (no message sent yet)
      return {
        label: "Send First Message",
        icon: MessageSquare,
        variant: "default" as const,
        onClick: () => handleOpenTemplate({
          category: "FIRST_MESSAGE",
          preferredType: "sms",
          title: "Send First Message",
          onComplete: handleMarkFirstMessageSent,
        }),
        disabled: !contact.phone,
      };
    }

    // ============================================
    // SCHEDULED INSPECTION STAGE
    // ============================================
    if (stageName === STAGE_NAMES.SCHEDULED_INSPECTION) {
      // After appointment - Assign Status
      if (isAppointmentPast || taskType === "ASSIGN_STATUS") {
        return {
          label: "Assign Status",
          icon: ClipboardCheck,
          variant: "default" as const,
          onClick: () => setShowAssignStatusDialog(true),
        };
      }
      
      // Before appointment - Send Reminder
      return {
        label: "Send Reminder",
        icon: Clock,
        variant: "default" as const,
        onClick: () => handleOpenTemplate({
          category: "APPOINTMENT_REMINDER",
          preferredType: "sms",
          title: "Appointment Reminder",
        }),
        disabled: !contact.phone,
      };
    }

    // ============================================
    // RETAIL PROSPECT STAGE
    // ============================================
    if (stageName === STAGE_NAMES.RETAIL_PROSPECT) {
      // Quote Follow Up (after quote was sent)
      if (taskType === "QUOTE_FOLLOW_UP" || contact.quoteSentAt) {
        return {
          label: "Send Quote Follow Up",
          icon: RefreshCw,
          variant: "default" as const,
          onClick: () => handleOpenTemplate({
            category: "QUOTE_FOLLOW_UP",
            preferredType: "sms",
            title: "Quote Follow Up",
            onComplete: handleRescheduleFollowUp,
          }),
        };
      }
      
      // Send Quote (no quote sent yet)
      return {
        label: "Send Quote",
        icon: FileText,
        variant: "default" as const,
        onClick: () => handleOpenTemplate({
          category: "QUOTE",
          preferredType: "email",
          title: "Send Quote Email",
          onComplete: () => setShowQuoteDialog(true),
        }),
        disabled: !contact.email,
      };
    }

    // ============================================
    // CLAIM PROSPECT STAGE
    // ============================================
    if (stageName === STAGE_NAMES.CLAIM_PROSPECT) {
      // PA Follow Up (after PA was sent)
      if (taskType === "PA_FOLLOW_UP" || contact.paSentAt) {
        return {
          label: "Send PA Follow Up",
          icon: RefreshCw,
          variant: "default" as const,
          onClick: () => handleOpenTemplate({
            category: "PA_FOLLOW_UP",
            preferredType: "sms",
            title: "PA Agreement Follow Up",
            onComplete: handleRescheduleFollowUp,
          }),
        };
      }
      
      // Claim Rec Follow Up (after claim rec sent, before PA)
      if (taskType === "CLAIM_REC_FOLLOW_UP" || contact.claimRecSentAt) {
        return {
          label: "Send Claim Rec Follow Up",
          icon: RefreshCw,
          variant: "default" as const,
          onClick: () => handleOpenTemplate({
            category: "CLAIM_REC_FOLLOW_UP",
            preferredType: "sms",
            title: "Claim Rec Follow Up",
            onComplete: handleRescheduleFollowUp,
          }),
        };
      }
      
      // Send Claim Recommendation (no rec sent yet)
      return {
        label: "Send Claim Rec",
        icon: Shield,
        variant: "default" as const,
        onClick: () => requireClaimInfo(() => handleOpenTemplate({
          category: "CLAIM_RECOMMENDATION",
          preferredType: "email",
          title: "Send Claim Recommendation",
          onComplete: () => setShowClaimRecDialog(true),
        })),
        disabled: !contact.email,
      };
    }

    // ============================================
    // OPEN CLAIM STAGE
    // ============================================
    if (stageName === STAGE_NAMES.OPEN_CLAIM) {
      return {
        label: "Send Claim Follow Up",
        icon: RefreshCw,
        variant: "default" as const,
        onClick: () => handleOpenTemplate({
          category: "CLAIM_FOLLOW_UP",
          preferredType: "sms",
          title: "Claim Follow Up",
          onComplete: handleRescheduleFollowUp,
        }),
      };
    }

    // Legacy fallback for task types
    if (taskType === "ASSIGN_STATUS") {
      return {
        label: "Assign Status",
        icon: ClipboardCheck,
        variant: "default" as const,
        onClick: () => setShowAssignStatusDialog(true),
      };
    }

    return null;
  };

  const primaryAction = getPrimaryAction();

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Primary Action */}
          {primaryAction && (
            <Button
              variant={primaryAction.variant}
              className="w-full justify-start gap-2"
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled || isLoading}
            >
              <primaryAction.icon className="w-4 h-4" />
              {primaryAction.label}
            </Button>
          )}

          {/* Schedule Inspection - Always available for active non-scheduled stages */}
          {stageName !== STAGE_NAMES.SCHEDULED_INSPECTION && 
           stageName !== STAGE_NAMES.OPEN_CLAIM && (
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => setShowScheduleDialog(true)}
            >
              <CalendarIcon className="w-4 h-4" />
              Schedule Inspection
            </Button>
          )}

          {/* PA Agreement option for claim prospects */}
          {(stageName === STAGE_NAMES.CLAIM_PROSPECT && taskType !== "PA_AGREEMENT") && (
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => handleOpenTemplate({
                category: "PA_AGREEMENT",
                preferredType: "email",
                title: "Send PA Agreement",
                onComplete: () => setShowPADialog(true),
              })}
            >
              <FileText className="w-4 h-4" />
              Send PA Agreement
            </Button>
          )}

          {/* Upload PA for PA Follow Up */}
          {taskType === "PA_FOLLOW_UP" && (
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => {
                // Navigate to files tab with upload prompt
                toast.info("Upload signed PA in the Files tab");
              }}
            >
              <Upload className="w-4 h-4" />
              Upload Signed PA
            </Button>
          )}

          <div className="border-t pt-2 mt-2 space-y-2">
            {/* Terminal Status Options */}
            <Button
              variant="outline"
              className="w-full justify-start gap-2 text-green-600 hover:text-green-700 hover:bg-green-50"
              onClick={() => setShowApproveDialog(true)}
            >
              <ThumbsUp className="w-4 h-4" />
              Mark Approved
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start gap-2 text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50"
              onClick={() => setShowSeasonalDialog(true)}
            >
              <Snowflake className="w-4 h-4" />
              Seasonal Follow-up
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => setShowNotInterestedDialog(true)}
            >
              <XCircle className="w-4 h-4" />
              Not Interested
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Claim Info Card - Show for claim-related stages */}
      {(stageName === STAGE_NAMES.CLAIM_PROSPECT || stageName === STAGE_NAMES.OPEN_CLAIM) && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Claim Info
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  // Sync state with contact data before opening edit dialog
                  setCarrier(contact.carrier || "");
                  setDateOfLoss(contact.dateOfLoss ? new Date(contact.dateOfLoss) : undefined);
                  setPolicyNumber(contact.policyNumber || "");
                  setClaimNumber(contact.claimNumber || "");
                  setShowEditClaimInfoDialog(true);
                }}
              >
                Edit
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Carrier:</span>
              <span className={!contact.carrier ? "text-amber-500" : ""}>{contact.carrier || "Required"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date of Loss:</span>
              <span className={!contact.dateOfLoss ? "text-amber-500" : ""}>{contact.dateOfLoss ? format(new Date(contact.dateOfLoss), "MMM d, yyyy") : "Required"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Policy #:</span>
              <span>{contact.policyNumber || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Claim #:</span>
              <span>{contact.claimNumber || "—"}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Template Selector */}
      {templateConfig && (
        <TemplateSelector
          open={showTemplateSelector}
          onOpenChange={setShowTemplateSelector}
          category={templateConfig.category}
          context={templateContext}
          preferredType={templateConfig.preferredType}
          title={templateConfig.title}
          onSelect={handleTemplateSelect}
        />
      )}

      {/* Schedule Inspection Dialog */}
      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Inspection</DialogTitle>
            <DialogDescription>
              Set a date and time for the initial inspection
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
                placeholder="Any notes about this inspection..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScheduleDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleScheduleInspection} disabled={isLoading || !appointmentDate}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Status Dialog */}
      <Dialog open={showAssignStatusDialog} onOpenChange={setShowAssignStatusDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Status</DialogTitle>
            <DialogDescription>
              How did the inspection go? Is this a retail or claim opportunity?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <Button
                variant={assignType === "retail" ? "default" : "outline"}
                className="h-20 flex-col gap-2"
                onClick={() => setAssignType("retail")}
              >
                <Home className="w-6 h-6" />
                <span>Retail Prospect</span>
              </Button>
              <Button
                variant={assignType === "claim" ? "default" : "outline"}
                className="h-20 flex-col gap-2"
                onClick={() => setAssignType("claim")}
              >
                <Shield className="w-6 h-6" />
                <span>Claim Prospect</span>
              </Button>
            </div>

            {assignType === "retail" && (
              <div className="space-y-2">
                <Label>Quote Type *</Label>
                <Select value={quoteType} onValueChange={setQuoteType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select quote type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Full Roof Replacement">Full Roof Replacement</SelectItem>
                    <SelectItem value="Roof Repair">Roof Repair</SelectItem>
                    <SelectItem value="Gutters">Gutters</SelectItem>
                    <SelectItem value="Siding">Siding</SelectItem>
                    <SelectItem value="Multiple Services">Multiple Services</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {assignType === "claim" && (
              <>
                <div className="space-y-2">
                  <Label>Insurance Carrier *</Label>
                  <Input
                    value={carrier}
                    onChange={(e) => setCarrier(e.target.value)}
                    placeholder="e.g., State Farm, Allstate"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date of Loss *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !dateOfLoss && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateOfLoss ? format(dateOfLoss, "PPP") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={dateOfLoss}
                        onSelect={setDateOfLoss}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>Inspection Notes</Label>
              <Textarea
                value={assignNotes}
                onChange={(e) => setAssignNotes(e.target.value)}
                placeholder="Notes from the inspection..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignStatusDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssignStatus} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Assign Status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quote Sent Confirmation Dialog */}
      <Dialog open={showQuoteDialog} onOpenChange={setShowQuoteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quote Sent?</DialogTitle>
            <DialogDescription>
              Confirm that you sent the quote to start the follow-up cycle.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuoteDialog(false)}>
              Not Yet
            </Button>
            <Button onClick={handleMarkQuoteSent} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Yes, Quote Sent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Claim Rec Dialog */}
      <Dialog open={showClaimRecDialog} onOpenChange={setShowClaimRecDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Claim Recommendation Sent</DialogTitle>
            <DialogDescription>
              Confirm the claim details to start the follow-up cycle.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Insurance Carrier *</Label>
              <Input
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                placeholder="e.g., State Farm"
              />
            </div>
            <div className="space-y-2">
              <Label>Date of Loss *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateOfLoss && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateOfLoss ? format(dateOfLoss, "PPP") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dateOfLoss}
                    onSelect={setDateOfLoss}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClaimRecDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleMarkClaimRecSent} disabled={isLoading || !carrier || !dateOfLoss}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Sent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Claim Info Required Dialog - Shows before sending claim rec if info is missing */}
      <Dialog open={showClaimInfoDialog} onOpenChange={(open) => {
        setShowClaimInfoDialog(open);
        if (!open) setPendingClaimAction(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-500" />
              Claim Information Required
            </DialogTitle>
            <DialogDescription>
              Please enter the carrier and date of loss before sending the claim recommendation. This information will be included in your message.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Insurance Carrier *</Label>
              <Input
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                placeholder="e.g., State Farm, Allstate, USAA"
              />
            </div>
            <div className="space-y-2">
              <Label>Date of Loss *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateOfLoss && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateOfLoss ? format(dateOfLoss, "PPP") : "Select date of loss"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dateOfLoss}
                    onSelect={setDateOfLoss}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowClaimInfoDialog(false);
              setPendingClaimAction(null);
            }}>
              Cancel
            </Button>
            <Button onClick={handleSaveClaimInfo} disabled={isLoading || !carrier || !dateOfLoss}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save & Continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Claim Info Dialog */}
      <Dialog open={showEditClaimInfoDialog} onOpenChange={setShowEditClaimInfoDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Edit Claim Information
            </DialogTitle>
            <DialogDescription>
              Update the claim details for this contact.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Insurance Carrier</Label>
              <Input
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                placeholder="e.g., State Farm, Allstate, USAA"
              />
            </div>
            <div className="space-y-2">
              <Label>Date of Loss</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateOfLoss && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateOfLoss ? format(dateOfLoss, "PPP") : "Select date of loss"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dateOfLoss}
                    onSelect={setDateOfLoss}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Policy Number</Label>
              <Input
                value={policyNumber}
                onChange={(e) => setPolicyNumber(e.target.value)}
                placeholder="Policy number"
              />
            </div>
            <div className="space-y-2">
              <Label>Claim Number</Label>
              <Input
                value={claimNumber}
                onChange={(e) => setClaimNumber(e.target.value)}
                placeholder="Claim number"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditClaimInfoDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateClaimInfo} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PA Sent Dialog */}
      <Dialog open={showPADialog} onOpenChange={setShowPADialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>PA Agreement Sent?</DialogTitle>
            <DialogDescription>
              Confirm that you sent the PA Agreement to start the follow-up cycle.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPADialog(false)}>
              Not Yet
            </Button>
            <Button onClick={handleMarkPASent} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Yes, PA Sent"}
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
              Congratulations! This job has been approved.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about this approval..."
              rows={3}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => handleTerminalStatus("approved")} 
              disabled={isLoading}
              className="bg-green-600 hover:bg-green-700"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Approve
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Seasonal Dialog */}
      <Dialog open={showSeasonalDialog} onOpenChange={setShowSeasonalDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Seasonal Follow-up</DialogTitle>
            <DialogDescription>
              This contact will be reminded in spring.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label>Follow-up Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
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
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Why are we following up later..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSeasonalDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => handleTerminalStatus("seasonal")} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <>
                  <Clock className="w-4 h-4 mr-2" />
                  Set Follow-up
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Not Interested Dialog */}
      <Dialog open={showNotInterestedDialog} onOpenChange={setShowNotInterestedDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Not Interested</DialogTitle>
            <DialogDescription>
              This contact is no longer interested.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for not interested..."
              rows={3}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNotInterestedDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => handleTerminalStatus("not_interested")} 
              disabled={isLoading}
              variant="destructive"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
