"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { updateUserProfile } from "@/lib/actions/organizations";
import { Loader2, User, Save } from "lucide-react";

interface ProfileSettingsProps {
  initialFullName: string;
  initialEmail: string;
  initialCompanyName: string;
}

export function ProfileSettings({
  initialFullName,
  initialEmail,
  initialCompanyName,
}: ProfileSettingsProps) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initialFullName);
  const [companyName, setCompanyName] = useState(initialCompanyName);
  const [isSaving, setIsSaving] = useState(false);

  const hasChanges =
    fullName !== initialFullName || companyName !== initialCompanyName;

  async function handleSave() {
    if (!fullName.trim()) {
      toast.error("Full name is required");
      return;
    }
    setIsSaving(true);
    try {
      const result = await updateUserProfile({
        fullName: fullName.trim(),
        companyName: companyName.trim(),
      });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Profile updated");
        router.refresh();
      }
    } catch {
      toast.error("Failed to save profile");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <User className="w-5 h-5" />
          Profile
        </CardTitle>
        <CardDescription>
          Your name here is how Josh AI signs off on all messages
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
            />
            <p className="text-[11px] text-muted-foreground">
              Josh AI uses this to write and sign messages as you
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={initialEmail} disabled />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="company">Company Name</Label>
          <Input
            id="company"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Your Roofing Company"
          />
        </div>
        <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
          {isSaving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Changes
        </Button>
      </CardContent>
    </Card>
  );
}
