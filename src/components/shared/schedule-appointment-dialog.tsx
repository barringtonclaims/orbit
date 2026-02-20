"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar as CalendarWidget } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarIcon, MapPin, Phone, ClipboardList, Loader2, ArrowLeft } from "lucide-react";
import { createAppointment } from "@/lib/actions/appointments";
import { toast } from "sonner";

interface AppointmentType {
  id: string;
  name: string;
  includesLocation: boolean;
}

interface ContactInfo {
  id: string;
  firstName: string;
  lastName: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
}

interface ScheduleAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: ContactInfo;
  appointmentTypes: AppointmentType[];
  onSuccess?: () => void;
}

export function ScheduleAppointmentDialog({
  open,
  onOpenChange,
  contact,
  appointmentTypes,
  onSuccess,
}: ScheduleAppointmentDialogProps) {
  const [step, setStep] = useState<"type" | "details">("type");
  const [selectedType, setSelectedType] = useState<AppointmentType | null>(null);
  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState("09:00");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setStep("type");
      setSelectedType(null);
      setDate(undefined);
      setTime("09:00");
      setLocation("");
      setDescription("");
    }
  }, [open]);

  function handleTypeSelect(type: AppointmentType) {
    setSelectedType(type);
    setStep("details");

    if (type.includesLocation) {
      const parts = [contact.address, contact.city, contact.state].filter(Boolean);
      setLocation(parts.join(", "));
    } else {
      setLocation("");
    }
  }

  async function handleSubmit() {
    if (!selectedType || !date) return;

    const [hours, minutes] = time.split(":").map(Number);
    const startTime = new Date(date);
    startTime.setHours(hours, minutes, 0, 0);

    setIsSubmitting(true);
    try {
      const result = await createAppointment({
        contactId: contact.id,
        type: selectedType.name,
        startTime,
        location: selectedType.includesLocation ? location || undefined : undefined,
        description: description || undefined,
      });

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`${selectedType.name} scheduled`);
        onOpenChange(false);
        onSuccess?.();
      }
    } catch {
      toast.error("Failed to schedule appointment");
    } finally {
      setIsSubmitting(false);
    }
  }

  const contactName = `${contact.firstName} ${contact.lastName}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === "type"
              ? `Schedule — ${contactName}`
              : `${selectedType?.name} — ${contactName}`}
          </DialogTitle>
        </DialogHeader>

        {step === "type" && (
          <div className="grid gap-2 py-2">
            {appointmentTypes.map((type) => (
              <Button
                key={type.id}
                variant="outline"
                className="justify-start h-auto py-3 px-4"
                onClick={() => handleTypeSelect(type)}
              >
                <div className="flex items-center gap-3">
                  {type.includesLocation ? (
                    <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : (
                    <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="font-medium">{type.name}</span>
                </div>
              </Button>
            ))}
          </div>
        )}

        {step === "details" && selectedType && (
          <div className="space-y-4 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 -ml-2 mb-1"
              onClick={() => setStep("type")}
            >
              <ArrowLeft className="w-3 h-3" />
              Back
            </Button>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? format(date, "MMM d, yyyy") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarWidget
                      mode="single"
                      selected={date}
                      onSelect={setDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Time</Label>
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>

            {selectedType.includesLocation && (
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Address"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Any details about this appointment..."
                rows={2}
              />
            </div>

            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={!date || isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ClipboardList className="w-4 h-4 mr-2" />
              )}
              Schedule {selectedType.name}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
