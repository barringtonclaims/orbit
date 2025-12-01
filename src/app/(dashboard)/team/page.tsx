"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  createOrganization,
  getOrganization,
  getOrganizationMembers,
  inviteMember,
  updateMemberRole,
  removeMember,
} from "@/lib/actions/organizations";
import { 
  Building2, 
  Plus, 
  UserPlus, 
  Settings,
  Users,
  Crown,
  Shield,
  User,
  MoreHorizontal,
  Loader2,
  Mail,
} from "lucide-react";

interface Member {
  id: string;
  userId: string;
  role: "OWNER" | "MANAGER" | "MEMBER";
  joinedAt: Date;
  user: {
    id: string;
    fullName: string;
    email: string;
    avatarUrl: string | null;
  };
  leadsCount: number;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export default function TeamPage() {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [orgName, setOrgName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"MANAGER" | "MEMBER">("MEMBER");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    
    const [orgResult, membersResult] = await Promise.all([
      getOrganization(),
      getOrganizationMembers(),
    ]);

    if (orgResult.data) {
      setOrganization(orgResult.data);
    }
    
    if (membersResult.data) {
      setMembers(membersResult.data);
    }

    setIsLoading(false);
  }

  const handleCreateOrg = async () => {
    if (!orgName.trim()) {
      toast.error("Organization name is required");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await createOrganization({ name: orgName.trim() });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Organization created!");
      setShowCreateDialog(false);
      setOrgName("");
      loadData();
    } catch {
      toast.error("Failed to create organization");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      toast.error("Email is required");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await inviteMember(inviteEmail.trim(), inviteRole);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Member added!");
      setShowInviteDialog(false);
      setInviteEmail("");
      setInviteRole("MEMBER");
      loadData();
    } catch {
      toast.error("Failed to invite member");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoleChange = async (memberId: string, role: "MANAGER" | "MEMBER") => {
    try {
      const result = await updateMemberRole(memberId, role);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Role updated");
      loadData();
    } catch {
      toast.error("Failed to update role");
    }
  };

  const handleRemove = async (memberId: string) => {
    if (!confirm("Are you sure you want to remove this member?")) {
      return;
    }

    try {
      const result = await removeMember(memberId);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Member removed");
      loadData();
    } catch {
      toast.error("Failed to remove member");
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "OWNER":
        return <Crown className="w-4 h-4 text-amber-500" />;
      case "MANAGER":
        return <Shield className="w-4 h-4 text-blue-500" />;
      default:
        return <User className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "OWNER":
        return <Badge className="bg-amber-500 hover:bg-amber-600">Owner</Badge>;
      case "MANAGER":
        return <Badge className="bg-blue-500 hover:bg-blue-600">Manager</Badge>;
      default:
        return <Badge variant="secondary">Member</Badge>;
    }
  };

  const canManageMembers = organization?.role === "OWNER" || organization?.role === "MANAGER";
  const isOwner = organization?.role === "OWNER";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Team</h1>
          <p className="text-muted-foreground mt-1">
            Collaborate with your team on leads
          </p>
        </div>

        <Card className="max-w-2xl">
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 rounded-full bg-primary/10 mx-auto flex items-center justify-center mb-4">
              <Building2 className="w-8 h-8 text-primary" />
            </div>
            <CardTitle>Create Your Organization</CardTitle>
            <CardDescription>
              Organizations let you collaborate with team members, share leads, and track performance.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Create Organization
            </Button>
          </CardContent>
        </Card>

        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="text-lg">Going Solo?</CardTitle>
            <CardDescription>
              That&apos;s perfectly fine! You can use Orbit as a personal CRM without an organization. 
              You can always create one later when you&apos;re ready to grow your team.
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Create Organization Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Organization</DialogTitle>
              <DialogDescription>
                Give your organization a name to get started
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label htmlFor="orgName">Organization Name</Label>
              <Input
                id="orgName"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="e.g., Shake Guys Roofing"
                className="mt-2"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateOrg} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Team</h1>
          <p className="text-muted-foreground mt-1">
            Manage your organization and team members
          </p>
        </div>
        {canManageMembers && (
          <Button onClick={() => setShowInviteDialog(true)} className="gap-2">
            <UserPlus className="w-4 h-4" />
            Add Member
          </Button>
        )}
      </div>

      {/* Organization Info */}
      <Card>
        <CardContent className="flex items-center gap-4 pt-6">
          <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold">{organization.name}</h2>
            <p className="text-muted-foreground">{members.length} member{members.length !== 1 ? "s" : ""}</p>
          </div>
          {getRoleBadge(organization.role)}
        </CardContent>
      </Card>

      {/* Team Members */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Users className="w-5 h-5" />
          Team Members
        </h3>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {members.map((member) => (
            <Card key={member.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={member.user.avatarUrl || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {member.user.fullName.split(" ").map(n => n[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{member.user.fullName}</p>
                        {getRoleIcon(member.role)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {member.user.email}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {member.leadsCount} lead{member.leadsCount !== 1 ? "s" : ""} assigned
                      </p>
                    </div>
                  </div>

                  {isOwner && member.role !== "OWNER" && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleRoleChange(
                            member.id,
                            member.role === "MANAGER" ? "MEMBER" : "MANAGER"
                          )}
                        >
                          {member.role === "MANAGER" ? (
                            <>
                              <User className="w-4 h-4 mr-2" />
                              Demote to Member
                            </>
                          ) : (
                            <>
                              <Shield className="w-4 h-4 mr-2" />
                              Promote to Manager
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleRemove(member.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          Remove from Team
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Invite Member Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>
              Invite someone to join your organization. They must have an Orbit account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="teammate@example.com"
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={inviteRole}
                onValueChange={(value) => setInviteRole(value as "MANAGER" | "MEMBER")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEMBER">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Member - Can manage assigned leads only
                    </div>
                  </SelectItem>
                  <SelectItem value="MANAGER">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      Manager - Can view all leads and assign to members
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleInvite} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
