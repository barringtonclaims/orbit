"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
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
import { getCarriers, createCarrier, updateCarrier, deleteCarrier } from "@/lib/actions/carriers";
import { Plus, Pencil, Trash2, Loader2, Building2, Mail } from "lucide-react";

interface Carrier {
  id: string;
  name: string;
  emailType: "UNIFIED" | "PER_ADJUSTER";
  unifiedEmail: string | null;
  requiresClaimInSubject: boolean;
  subjectFormat: string | null;
  notes: string | null;
}

export function CarrierSettings() {
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingCarrier, setEditingCarrier] = useState<Carrier | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form
  const [name, setName] = useState("");
  const [emailType, setEmailType] = useState<"UNIFIED" | "PER_ADJUSTER">("PER_ADJUSTER");
  const [unifiedEmail, setUnifiedEmail] = useState("");
  const [requiresClaim, setRequiresClaim] = useState(true);
  const [subjectFormat, setSubjectFormat] = useState("Claim #{{claimNumber}} - {{customerName}}");

  useEffect(() => { loadCarriers(); }, []);

  const loadCarriers = async () => {
    setIsLoading(true);
    const result = await getCarriers();
    if (result.data) setCarriers(result.data);
    setIsLoading(false);
  };

  const resetForm = () => {
    setName("");
    setEmailType("PER_ADJUSTER");
    setUnifiedEmail("");
    setRequiresClaim(true);
    setSubjectFormat("Claim #{{claimNumber}} - {{customerName}}");
    setEditingCarrier(null);
  };

  const openCreate = () => {
    resetForm();
    setShowDialog(true);
  };

  const openEdit = (c: Carrier) => {
    setEditingCarrier(c);
    setName(c.name);
    setEmailType(c.emailType);
    setUnifiedEmail(c.unifiedEmail || "");
    setRequiresClaim(c.requiresClaimInSubject);
    setSubjectFormat(c.subjectFormat || "Claim #{{claimNumber}} - {{customerName}}");
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    if (emailType === "UNIFIED" && !unifiedEmail.trim()) { toast.error("Unified email is required"); return; }

    setIsSubmitting(true);
    try {
      const data = {
        name: name.trim(),
        emailType,
        unifiedEmail: emailType === "UNIFIED" ? unifiedEmail.trim() : undefined,
        requiresClaimInSubject: requiresClaim,
        subjectFormat: requiresClaim ? subjectFormat : undefined,
      };

      const result = editingCarrier
        ? await updateCarrier(editingCarrier.id, data)
        : await createCarrier(data);

      if (result.error) { toast.error(result.error); return; }
      toast.success(editingCarrier ? "Carrier updated" : "Carrier added");
      setShowDialog(false);
      resetForm();
      loadCarriers();
    } catch {
      toast.error("Failed to save carrier");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this carrier?")) return;
    const result = await deleteCarrier(id);
    if (result.error) { toast.error(result.error); return; }
    toast.success("Carrier deleted");
    loadCarriers();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Insurance Carriers
            </CardTitle>
            <CardDescription>
              Configure how carrier follow-up emails are routed. Unified carriers use one shared inbox; Per-Adjuster carriers prompt for the adjuster&apos;s email each time.
            </CardDescription>
          </div>
          <Button onClick={openCreate} size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            Add Carrier
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : carriers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Building2 className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>No carriers added yet.</p>
            <p className="text-sm">Add your first carrier to enable smart email routing.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {carriers.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">{c.name}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Badge variant={c.emailType === "UNIFIED" ? "default" : "secondary"} className="text-xs">
                        {c.emailType === "UNIFIED" ? "Unified Inbox" : "Per Adjuster"}
                      </Badge>
                      {c.unifiedEmail && (
                        <span className="flex items-center gap-1 truncate">
                          <Mail className="w-3 h-3" />
                          {c.unifiedEmail}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(c.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCarrier ? "Edit Carrier" : "Add Carrier"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Carrier Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., State Farm" />
            </div>

            <div className="space-y-2">
              <Label>Email Routing Type</Label>
              <Select value={emailType} onValueChange={(v) => setEmailType(v as "UNIFIED" | "PER_ADJUSTER")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UNIFIED">Unified Inbox (one email for all claims)</SelectItem>
                  <SelectItem value="PER_ADJUSTER">Per Adjuster (different email each time)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {emailType === "UNIFIED"
                  ? "All claims go to one shared email. Claim # is included in the subject line."
                  : "Each adjuster has a unique email. You'll be prompted to enter the adjuster's email for each contact."}
              </p>
            </div>

            {emailType === "UNIFIED" && (
              <div className="space-y-2">
                <Label>Unified Email Address</Label>
                <Input value={unifiedEmail} onChange={(e) => setUnifiedEmail(e.target.value)} placeholder="e.g., statefarmfireclaims@statefarm.com" type="email" />
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <Label>Claim # in Subject</Label>
                <p className="text-xs text-muted-foreground">Require claim number in email subject</p>
              </div>
              <Switch checked={requiresClaim} onCheckedChange={setRequiresClaim} />
            </div>

            {requiresClaim && (
              <div className="space-y-2">
                <Label>Subject Line Format</Label>
                <Input value={subjectFormat} onChange={(e) => setSubjectFormat(e.target.value)} placeholder="Claim #{{claimNumber}} - {{customerName}}" />
                <p className="text-xs text-muted-foreground">
                  Available variables: {"{{claimNumber}}"}, {"{{customerName}}"}, {"{{policyNumber}}"}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={isSubmitting}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {editingCarrier ? "Save Changes" : "Add Carrier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
