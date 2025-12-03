"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const [stages, setStages] = useState<Stage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    async function loadStages() {
      const { data } = await getLeadStages();
      if (data) {
        setStages(data);
      }
    }
    loadStages();
  }, []);

  const handleStageChange = async (stage: Stage) => {
    if (stage.id === currentStage?.id) {
      setIsOpen(false);
      return;
    }

    setIsLoading(true);

    try {
      const result = await updateContactStage(contactId, stage.id);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(`Stage updated to "${stage.name}"`);
      onStageChange?.(stage);
      setIsOpen(false);
    } catch {
      toast.error("Failed to update stage");
    } finally {
      setIsLoading(false);
    }
  };

  const activeStages = stages.filter((s) => s.stageType === "ACTIVE");
  const terminalStages = stages.filter((s) => s.stageType !== "ACTIVE");

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="gap-2"
          disabled={isLoading}
        >
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
            "Select Stage"
          )}
          <ChevronDown className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {activeStages.map((stage) => (
          <DropdownMenuItem
            key={stage.id}
            onClick={() => handleStageChange(stage)}
            className="gap-2"
          >
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: stage.color }}
            />
            <span className="flex-1">{stage.name}</span>
            {currentStage?.id === stage.id && (
              <Check className="w-4 h-4" />
            )}
          </DropdownMenuItem>
        ))}
        
        {terminalStages.length > 0 && (
          <>
            <DropdownMenuSeparator />
            {terminalStages.map((stage) => (
              <DropdownMenuItem
                key={stage.id}
                onClick={() => handleStageChange(stage)}
                className="gap-2"
              >
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: stage.color }}
                />
                <span className="flex-1">{stage.name}</span>
                {currentStage?.id === stage.id && (
                  <Check className="w-4 h-4" />
                )}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


