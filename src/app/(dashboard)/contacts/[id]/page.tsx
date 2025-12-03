import { notFound } from "next/navigation";
import Link from "next/link";
import { getContact } from "@/lib/actions/contacts";
import { getOrganization } from "@/lib/actions/organizations";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContactActions } from "@/components/contacts/contact-actions";
import { ContactTimeline } from "@/components/contacts/contact-timeline";
import { ContactTasks } from "@/components/contacts/contact-tasks";
import { ContactFiles } from "@/components/contacts/contact-files";
import { StageSelector } from "@/components/contacts/stage-selector";
import { WorkflowActions } from "@/components/contacts/workflow-actions";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  MessageSquare,
  FileText,
  CheckSquare,
  Clock,
  Shield,
  Briefcase,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { STAGE_NAMES } from "@/types";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: contact } = await getContact(id);
  
  if (!contact) {
    return { title: "Contact Not Found" };
  }
  
  return {
    title: `${contact.firstName} ${contact.lastName}`,
  };
}

export default async function ContactDetailPage({ 
  params, 
  searchParams 
}: { 
  params: Promise<{ id: string }>,
  searchParams: Promise<{ action?: string }> 
}) {
  const { id } = await params;
  const { action } = await searchParams;
  
  const [contactResult, orgResult] = await Promise.all([
    getContact(id),
    getOrganization(),
  ]);

  const contact = contactResult.data;
  const error = contactResult.error;
  const inspectionDays = orgResult.data?.inspectionDays || [2, 4];

  if (error || !contact) {
    notFound();
  }

  const fullName = `${contact.firstName} ${contact.lastName}`;
  const initials = `${contact.firstName[0]}${contact.lastName[0]}`.toUpperCase();
  
  const pendingTasks = contact.tasks.filter(t => t.status === "PENDING" || t.status === "IN_PROGRESS");
  const nextTask = pendingTasks[0];

  const defaultOpenSMS = action === "send-first";
  
  // Check if this is a claim-related stage
  const isClaimStage = contact.stage?.name === STAGE_NAMES.CLAIM_PROSPECT || 
                       contact.stage?.name === STAGE_NAMES.OPEN_CLAIM;
  
  // Check if this is an approved job
  const isApproved = contact.stage?.stageType === "APPROVED";

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/contacts">
          <Button variant="ghost" size="icon" className="shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        
        <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-4">
          <Avatar className="w-16 h-16">
            <AvatarFallback className="bg-primary/10 text-primary text-xl">
              {initials}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold">{fullName}</h1>
              <StageSelector
                contactId={contact.id}
                currentStage={contact.stage}
              />
            </div>
            <p className="text-muted-foreground">
              Added {formatDistanceToNow(new Date(contact.createdAt), { addSuffix: true })}
              {contact.source && ` · ${contact.source}`}
            </p>
          </div>
          
          <ContactActions 
            contact={contact} 
            defaultOpenSMS={defaultOpenSMS}
            inspectionDays={inspectionDays}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Contact Info & Actions */}
        <div className="space-y-6">
          {/* Contact Details Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Contact Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {contact.email && (
                <a
                  href={`mailto:${contact.email}`}
                  className="flex items-center gap-3 text-sm hover:text-primary transition-colors"
                >
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  {contact.email}
                </a>
              )}
              
              {contact.phone && (
                <a
                  href={`tel:${contact.phone}`}
                  className="flex items-center gap-3 text-sm hover:text-primary transition-colors"
                >
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  {contact.phone}
                </a>
              )}
              
              {(contact.address || contact.city) && (
                <div className="flex items-start gap-3 text-sm">
                  <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div>
                    {contact.address && <p>{contact.address}</p>}
                    {(contact.city || contact.state || contact.zipCode) && (
                      <p className="text-muted-foreground">
                        {[contact.city, contact.state, contact.zipCode].filter(Boolean).join(", ")}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {!contact.email && !contact.phone && !contact.address && (
                <p className="text-muted-foreground text-sm">No contact details</p>
              )}
            </CardContent>
          </Card>

          {/* Workflow Actions */}
          <WorkflowActions
            contact={{
              id: contact.id,
              firstName: contact.firstName,
              lastName: contact.lastName,
              phone: contact.phone,
              email: contact.email,
              address: contact.address,
              city: contact.city,
              state: contact.state,
              zipCode: contact.zipCode,
              carrier: contact.carrier,
              dateOfLoss: contact.dateOfLoss,
              policyNumber: contact.policyNumber,
              claimNumber: contact.claimNumber,
              quoteType: contact.quoteType,
              jobStatus: contact.jobStatus,
              // Workflow state tracking
              firstMessageSentAt: contact.firstMessageSentAt,
              quoteSentAt: contact.quoteSentAt,
              claimRecSentAt: contact.claimRecSentAt,
              paSentAt: contact.paSentAt,
              stage: contact.stage ? {
                id: contact.stage.id,
                name: contact.stage.name,
                stageType: contact.stage.stageType,
                workflowType: contact.stage.workflowType,
              } : null,
            }}
            currentTask={nextTask ? { 
              id: nextTask.id, 
              taskType: nextTask.taskType,
              actionButton: nextTask.actionButton,
              appointmentTime: nextTask.appointmentTime,
            } : null}
            inspectionDays={inspectionDays}
          />

          {/* Next Task Card */}
          {nextTask && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-primary">
                  <Clock className="w-4 h-4" />
                  Current Task
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-medium text-sm">{nextTask.title}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Due {formatDistanceToNow(new Date(nextTask.dueDate), { addSuffix: true })}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Assigned To */}
          {contact.assignedTo && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Assigned To</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={contact.assignedTo.avatarUrl || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {contact.assignedTo.fullName.split(" ").map(n => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-sm">{contact.assignedTo.fullName}</p>
                    <p className="text-xs text-muted-foreground">{contact.assignedTo.email}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Timeline & Details */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="timeline" className="space-y-4">
            <TabsList>
              <TabsTrigger value="timeline" className="gap-2">
                <MessageSquare className="w-4 h-4" />
                Timeline
                <Badge variant="secondary" className="ml-1">
                  {contact.timeline.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="tasks" className="gap-2">
                <CheckSquare className="w-4 h-4" />
                Tasks
                <Badge variant="secondary" className="ml-1">
                  {pendingTasks.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="files" className="gap-2">
                <FileText className="w-4 h-4" />
                Files
                <Badge variant="secondary" className="ml-1">
                  {contact.files.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="timeline">
              <ContactTimeline 
                contactId={contact.id} 
                timeline={contact.timeline} 
              />
            </TabsContent>

            <TabsContent value="tasks">
              <ContactTasks 
                contactId={contact.id}
                tasks={contact.tasks}
              />
            </TabsContent>

            <TabsContent value="files">
              <ContactFiles 
                contactId={contact.id}
                files={contact.files}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
