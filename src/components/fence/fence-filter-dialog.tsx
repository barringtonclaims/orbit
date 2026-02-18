"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Filter } from "lucide-react";

interface Stage {
  id: string;
  name: string;
  color: string;
  isTerminal?: boolean;
}

interface TeamMember {
  id: string;
  fullName: string;
}

export interface FenceFilters {
  stageIds: string[];
  stageType: string;
  jobStatus: string;
  assignedToId: string;
}

interface FenceFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: Stage[];
  teamMembers: TeamMember[];
  filters: FenceFilters;
  onApply: (filters: FenceFilters) => void;
}

export function FenceFilterDialog({
  open,
  onOpenChange,
  stages,
  teamMembers,
  filters: initialFilters,
  onApply,
}: FenceFilterDialogProps) {
  const [filters, setFilters] = useState<FenceFilters>(initialFilters);

  const toggleStage = (stageId: string) => {
    setFilters((prev) => ({
      ...prev,
      stageIds: prev.stageIds.includes(stageId)
        ? prev.stageIds.filter((id) => id !== stageId)
        : [...prev.stageIds, stageId],
    }));
  };

  const handleApply = () => {
    onApply(filters);
    onOpenChange(false);
  };

  const handleReset = () => {
    const empty: FenceFilters = {
      stageIds: [],
      stageType: "",
      jobStatus: "",
      assignedToId: "",
    };
    setFilters(empty);
    onApply(empty);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!flex !flex-col sm:max-w-md max-h-[85vh] overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filter Contacts in Fence
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
          <div className="space-y-4 py-2">
            {/* Stage Selection */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Lead Stages
              </label>
              <div className="flex flex-wrap gap-1.5">
                {stages.map((stage) => {
                  const selected = filters.stageIds.includes(stage.id);
                  return (
                    <Badge
                      key={stage.id}
                      variant={selected ? "default" : "outline"}
                      className="cursor-pointer transition-colors"
                      style={
                        selected
                          ? { backgroundColor: stage.color, borderColor: stage.color }
                          : { borderColor: stage.color, color: stage.color }
                      }
                      onClick={() => toggleStage(stage.id)}
                    >
                      {stage.name}
                      {selected && <X className="w-3 h-3 ml-1" />}
                    </Badge>
                  );
                })}
              </div>
              {stages.length === 0 && (
                <p className="text-sm text-muted-foreground">No stages found</p>
              )}
            </div>

            {/* Stage Type */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Workflow Type
              </label>
              <Select
                value={filters.stageType || "all"}
                onValueChange={(v) =>
                  setFilters((prev) => ({
                    ...prev,
                    stageType: v === "all" ? "" : v,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="SEASONAL">Seasonal</SelectItem>
                  <SelectItem value="NOT_INTERESTED">Not Interested</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Job Status */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Job Status
              </label>
              <Select
                value={filters.jobStatus || "any"}
                onValueChange={(v) =>
                  setFilters((prev) => ({
                    ...prev,
                    jobStatus: v === "any" ? "" : v,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any Status</SelectItem>
                  <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Assigned Team Member */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Assigned To
              </label>
              <Select
                value={filters.assignedToId || "anyone"}
                onValueChange={(v) =>
                  setFilters((prev) => ({
                    ...prev,
                    assignedToId: v === "anyone" ? "" : v,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Anyone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anyone">Anyone</SelectItem>
                  {teamMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 sm:gap-0 border-t pt-4">
          <Button variant="outline" onClick={handleReset}>
            Reset
          </Button>
          <Button onClick={handleApply}>Apply Filters</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
