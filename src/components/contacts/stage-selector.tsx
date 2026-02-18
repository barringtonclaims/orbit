"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { toast } from "sonner";
import { getLeadStages, updateContactStage } from "@/lib/actions/stages";
import { ChevronDown, Check, Loader2 } from "lucide-react";

interface Stage {
  id: string;
  name: string;
  color: string;
  stageType: string;
  isTerminal: boolean;
  order: number;
}

interface StageSelectorProps {
  contactId: string;
  currentStage: Stage | null;
  onStageChange?: (stage: Stage) => void;
}

export function StageSelector({ contactId, currentStage, onStageChange }: StageSelectorProps) {
  const router = useRouter();
  const [stages, setStages] = useState<Stage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [pendingStage, setPendingStage] = useState<Stage | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    async function loadStages() {
      const { data } = await getLeadStages();
      if (data) setStages(data);
    }
    loadStages();
  }, []);

  const handleStageClick = (stage: Stage) => {
    if (stage.id === currentStage?.id) {
      setIsOpen(false);
      return;
    }

    // Terminal stages or major changes get a confirmation
    if (stage.isTerminal || (currentStage && !currentStage.isTerminal)) {
      setPendingStage(stage);
      setShowConfirm(true);
      setIsOpen(false);
    } else {
      executeStageChange(stage);
    }
  };

  const executeStageChange = async (stage: Stage) => {
    setIsLoading(true);
    setShowConfirm(false);
    setPendingStage(null);

    try {
      const result = await updateContactStage(contactId, stage.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(`Status updated to "${stage.name}"`);
      onStageChange?.(stage);
      setIsOpen(false);
      router.refresh();
    } catch {
      toast.error("Failed to update status");
    } finally {
      setIsLoading(false);
    }
  };

  const activeStages = stages.filter((s) => s.stageType === "ACTIVE");
  const terminalStages = stages.filter((s) => s.stageType !== "ACTIVE");

  return (
    <>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2" disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : currentStage ? (
              <>
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: currentStage.color }}
                />
                {currentStage.name}
              </>
            ) : (
              "Select Status"
            )}
            <ChevronDown className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {activeStages.map((stage) => (
            <DropdownMenuItem
              key={stage.id}
              onClick={() => handleStageClick(stage)}
              className="gap-2"
            >
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: stage.color }}
              />
              <span className="flex-1">{stage.name}</span>
              {currentStage?.id === stage.id && <Check className="w-4 h-4" />}
            </DropdownMenuItem>
          ))}
          
          {terminalStages.length > 0 && (
            <>
              <DropdownMenuSeparator />
              {terminalStages.map((stage) => (
                <DropdownMenuItem
                  key={stage.id}
                  onClick={() => handleStageClick(stage)}
                  className="gap-2"
                >
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: stage.color }}
                  />
                  <span className="flex-1">{stage.name}</span>
                  {currentStage?.id === stage.id && <Check className="w-4 h-4" />}
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change Status</AlertDialogTitle>
            <AlertDialogDescription>
              Change this contact from <strong>{currentStage?.name || "None"}</strong> to <strong>{pendingStage?.name}</strong>?
              {pendingStage?.isTerminal && " This is a terminal status."}
              {" "}Any existing tasks will be cancelled and a new task will be created for the new status.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingStage(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingStage && executeStageChange(pendingStage)}>
              Change Status
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
