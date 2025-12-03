"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { resetStagesToDefaults } from "@/lib/actions/stages";
import { seedWorkflowTemplates } from "@/lib/actions/templates";
import { Loader2, RefreshCw, Layers, FileText, Sparkles } from "lucide-react";

const CORRECT_STAGES = [
  { name: "New Lead", color: "#6366f1" },
  { name: "Scheduled Inspection", color: "#14b8a6" },
  { name: "Retail Prospect", color: "#f59e0b" },
  { name: "Claim Prospect", color: "#8b5cf6" },
  { name: "Open Claim", color: "#ec4899" },
  { name: "Approved Job", color: "#22c55e" },
  { name: "Seasonal Follow Up", color: "#06b6d4" },
  { name: "Not Interested", color: "#ef4444" },
];

export function StageSettings() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleResetStages = async () => {
    setIsLoading(true);
    try {
      const result = await resetStagesToDefaults();
      
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Stages reset to workflow defaults!");
      router.refresh();
    } catch {
      toast.error("Failed to reset stages");
    } finally {
      setIsLoading(false);
      setShowConfirm(false);
    }
  };

  const handleSeedTemplates = async () => {
    setIsLoadingTemplates(true);
    try {
      const result = await seedWorkflowTemplates();
      
      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (result.created === 0) {
        toast.info("All workflow categories already have templates");
      } else {
        toast.success(`Created ${result.created} default templates!`);
      }
      router.refresh();
    } catch {
      toast.error("Failed to seed templates");
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Layers className="w-5 h-5" />
            Lead Stages
          </CardTitle>
          <CardDescription>
            Configure your workflow stages for the roofing sales process
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-3">Workflow Stages:</p>
            <div className="flex flex-wrap gap-2">
              {CORRECT_STAGES.map((stage) => (
                <Badge
                  key={stage.name}
                  variant="outline"
                  className="gap-2"
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: stage.color }}
                  />
                  {stage.name}
                </Badge>
              ))}
            </div>
          </div>
          
          <Separator />
          
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                Seed Default Templates
              </p>
              <p className="text-sm text-muted-foreground">
                Create default message templates for all workflow stages (Quote, Claim Rec, PA, etc.)
              </p>
            </div>
            <Button 
              variant="outline" 
              className="gap-2"
              onClick={handleSeedTemplates}
              disabled={isLoadingTemplates}
            >
              {isLoadingTemplates ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              Seed Templates
            </Button>
          </div>

          <Separator />
          
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Reset Stages</p>
              <p className="text-sm text-muted-foreground">
                Reset all stages to the correct workflow defaults. Existing contacts will be moved to &quot;New Lead&quot;.
              </p>
            </div>
            <Button 
              variant="outline" 
              className="gap-2"
              onClick={() => setShowConfirm(true)}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Reset Stages
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Stages to Defaults?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all current stages and create the correct workflow stages. 
              Any existing contacts will be moved to the &quot;New Lead&quot; stage.
              <br /><br />
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleResetStages}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Resetting...
                </>
              ) : (
                "Yes, Reset Stages"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

