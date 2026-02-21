"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Building2, 
  ChevronDown, 
  Plus, 
  Check,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { 
  getUserOrganizations, 
  switchOrganization, 
  createOrganization 
} from "@/lib/actions/organizations";

interface Organization {
  id: string;
  name: string;
  slug: string;
  role: string;
  isActive: boolean;
}

interface OrganizationSwitcherProps {
  currentOrg: {
    id: string;
    name: string;
    role: string;
  } | null;
}

export function OrganizationSwitcher({ currentOrg }: OrganizationSwitcherProps) {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadOrganizations();
  }, []);

  const loadOrganizations = async () => {
    const result = await getUserOrganizations();
    if (result.data) {
      setOrganizations(result.data);
    }
  };

  const handleSwitch = async (orgId: string) => {
    if (orgId === currentOrg?.id) return;
    
    setIsLoading(true);
    try {
      const result = await switchOrganization(orgId);
      if (result.error) {
        toast.error(result.error);
        setIsLoading(false);
      } else {
        toast.success(`Switched to ${result.data?.name}`);
        window.location.reload();
      }
    } catch {
      toast.error("Failed to switch organization");
      setIsLoading(false);
    }
    // Don't setIsLoading(false) on success since page will reload
  };

  const handleCreate = async () => {
    if (!newOrgName.trim()) {
      toast.error("Organization name is required");
      return;
    }

    setIsCreating(true);
    try {
      const result = await createOrganization({ name: newOrgName.trim() });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Organization created!");
        setShowCreateDialog(false);
        setNewOrgName("");
        loadOrganizations();
        // Switch to the new org
        if (result.data) {
          await handleSwitch(result.data.id);
        }
      }
    } catch {
      toast.error("Failed to create organization");
    } finally {
      setIsCreating(false);
    }
  };

  if (!currentOrg) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowCreateDialog(true)}
        className="gap-2"
      >
        <Plus className="w-4 h-4" />
        Create Organization
      </Button>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            className="w-full justify-between gap-2 px-2 h-auto py-2"
            disabled={isLoading}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
              <div className="text-left min-w-0">
                <p className="font-medium text-sm truncate">{currentOrg.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{currentOrg.role.toLowerCase()}</p>
              </div>
            </div>
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 shrink-0 opacity-50" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[240px]">
          {organizations.map((org) => (
            <DropdownMenuItem
              key={org.id}
              onClick={() => handleSwitch(org.id)}
              className="gap-2 cursor-pointer"
            >
              <div className="w-6 h-6 rounded bg-primary/10 text-primary flex items-center justify-center">
                <Building2 className="w-3 h-3" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm">{org.name}</p>
              </div>
              {org.isActive && (
                <Check className="w-4 h-4 text-primary" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setShowCreateDialog(true)}
            className="gap-2 cursor-pointer"
          >
            <div className="w-6 h-6 rounded bg-muted flex items-center justify-center">
              <Plus className="w-3 h-3" />
            </div>
            <span>New Organization</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Organization</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="orgName">Organization Name</Label>
              <Input
                id="orgName"
                placeholder="e.g., Acme Roofing"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Create separate organizations for different businesses or customer groups. 
              Each organization has its own contacts, tasks, and settings.
            </p>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowCreateDialog(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreate}
              disabled={isCreating || !newOrgName.trim()}
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Organization"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

