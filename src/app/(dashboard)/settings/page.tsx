import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getOrganization, getUserProfile } from "@/lib/actions/organizations";
import { ProfileSettings } from "@/components/settings/profile-settings";
import { getTemplates } from "@/lib/actions/templates";
import { getGoogleConnectionStatus } from "@/lib/actions/google";
import { getCustomAppointmentTypes } from "@/lib/actions/custom-types";
import { getCustomTaskTypes } from "@/lib/actions/custom-types";
import { ScheduleSettings } from "@/components/settings/schedule-settings";
import { TemplateSettings } from "@/components/settings/template-settings";
import { StageSettings } from "@/components/settings/stage-settings";
import { getLeadStages } from "@/lib/actions/stages";
import { GoogleSettings } from "@/components/settings/google-settings";
import { CarrierSettings } from "@/components/settings/carrier-settings";
import { AppointmentTypeSettings } from "@/components/settings/appointment-type-settings";
import { TaskTypeSettings } from "@/components/settings/task-type-settings";
import { ResourceSettings } from "@/components/settings/resource-settings";
import { getResourceCompanies } from "@/lib/actions/resources";
import { JoshIntake } from "@/components/josh/josh-intake";
import { 
  User, 
  Bell, 
  Palette, 
  Shield, 
  Smartphone,
  Check,
  FileText,
  Settings2,
  Plug,
  Building2,
  Contact,
} from "lucide-react";

export const metadata = {
  title: "Settings",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; success?: string; error?: string }>;
}) {
  const { tab, success, error } = await searchParams;
  
  const [orgResult, templatesResult, googleResult, taskTypesResult, appointmentTypesResult, stagesResult, profileResult, resourceResult] = await Promise.all([
    getOrganization(),
    getTemplates(),
    getGoogleConnectionStatus(),
    getCustomTaskTypes(),
    getCustomAppointmentTypes(),
    getLeadStages(),
    getUserProfile(),
    getResourceCompanies(),
  ]);

  const org = orgResult.data;
  const templates = templatesResult.data || [];
  const googleStatus = googleResult.data;
  const taskTypes = taskTypesResult.data || [];
  const appointmentTypes = appointmentTypesResult.data || [];
  const stages = stagesResult.data || [];
  const profile = profileResult.data;
  const resourceCompanies = resourceResult.data || [];

  const defaultTab = tab || "general";

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your account, templates, and integrations
        </p>
      </div>

      {/* Success/Error Messages */}
      {success === "google_connected" && (
        <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg">
          Google account connected successfully! Calendar sync and Josh email processing are now enabled.
        </div>
      )}
      {error && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
          {error === "google_auth_failed" 
            ? "Failed to connect Google account. Please try again." 
            : error}
        </div>
      )}

      <Tabs defaultValue={defaultTab} className="space-y-6">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="general" className="gap-2 flex-1 min-w-fit">
            <Settings2 className="w-4 h-4" />
            <span className="hidden sm:inline">General</span>
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-2 flex-1 min-w-fit">
            <Plug className="w-4 h-4" />
            <span className="hidden sm:inline">Integrations</span>
          </TabsTrigger>
          <TabsTrigger value="carriers" className="gap-2 flex-1 min-w-fit">
            <Building2 className="w-4 h-4" />
            <span className="hidden sm:inline">Carriers</span>
          </TabsTrigger>
          <TabsTrigger value="resources" className="gap-2 flex-1 min-w-fit">
            <Contact className="w-4 h-4" />
            <span className="hidden sm:inline">Resources</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2 flex-1 min-w-fit">
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Templates</span>
          </TabsTrigger>
          <TabsTrigger value="account" className="gap-2 flex-1 min-w-fit">
            <User className="w-4 h-4" />
            <span className="hidden sm:inline">Account</span>
          </TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-6">
          {/* Profile */}
          <ProfileSettings
            initialFullName={profile?.fullName || ""}
            initialEmail={profile?.email || ""}
            initialCompanyName={profile?.companyName || ""}
          />

          {/* Schedule Configuration */}
          {org && (
            <ScheduleSettings 
              initialOfficeDays={org.officeDays}
              initialInspectionDays={org.inspectionDays}
              initialSeasonalMonth={org.seasonalFollowUpMonth}
              initialSeasonalDay={org.seasonalFollowUpDay}
            />
          )}

          {/* Stage Settings */}
          <StageSettings initialStages={stages} />

          {/* Appointment Types */}
          <AppointmentTypeSettings initialTypes={appointmentTypes} />

          {/* Task Types */}
          <TaskTypeSettings initialTypes={taskTypes} stages={stages} />

          {/* Appearance */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Palette className="w-5 h-5" />
                Appearance
              </CardTitle>
              <CardDescription>
                Customize how Relay looks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Theme</p>
                  <p className="text-sm text-muted-foreground">
                    Choose light or dark mode
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">Light</Button>
                  <Button variant="outline" size="sm">Dark</Button>
                  <Button variant="secondary" size="sm">System</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Notifications
              </CardTitle>
              <CardDescription>
                How you want to be notified
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Task Reminders</p>
                  <p className="text-sm text-muted-foreground">
                    Get notified when tasks are due
                  </p>
                </div>
                <Badge variant="secondary" className="gap-1">
                  <Check className="w-3 h-3" />
                  Enabled
                </Badge>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Browser Notifications</p>
                  <p className="text-sm text-muted-foreground">
                    Push notifications in your browser
                  </p>
                </div>
                <Button variant="outline" size="sm">Enable</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Integrations (Google) */}
        <TabsContent value="integrations" className="space-y-6">
          <Suspense fallback={<div>Loading integrations...</div>}>
            <GoogleSettings 
              isConnected={googleStatus?.isConnected || false}
              hasCalendarAccess={googleStatus?.hasCalendarAccess || false}
              hasGmailAccess={googleStatus?.hasGmailAccess || false}
              lastGmailSyncAt={googleStatus?.lastGmailSyncAt || null}
              authUrl={googleStatus?.authUrl || "#"}
              userEmail={googleStatus?.userEmail}
            />
          </Suspense>
          
          {/* Josh Email Intake */}
          {googleStatus?.hasGmailAccess && (
            <JoshIntake />
          )}
        </TabsContent>

        {/* Carriers Settings */}
        <TabsContent value="carriers">
          <CarrierSettings />
        </TabsContent>

        {/* Resource Contacts */}
        <TabsContent value="resources">
          <ResourceSettings initialCompanies={resourceCompanies} />
        </TabsContent>

        {/* Templates Settings */}
        <TabsContent value="templates">
          <Suspense fallback={<div>Loading templates...</div>}>
            <TemplateSettings templates={templates} taskTypes={taskTypes} />
          </Suspense>
        </TabsContent>

        {/* Account Settings */}
        <TabsContent value="account" className="space-y-6">
          {/* Security */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Security
              </CardTitle>
              <CardDescription>
                Keep your account safe
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Change Password</p>
                  <p className="text-sm text-muted-foreground">
                    Update your account password
                  </p>
                </div>
                <Button variant="outline">Change</Button>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Active Sessions</p>
                  <p className="text-sm text-muted-foreground">
                    Manage your logged-in devices
                  </p>
                </div>
                <Button variant="outline">View</Button>
              </div>
            </CardContent>
          </Card>

          {/* Mobile App */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Smartphone className="w-5 h-5" />
                Mobile App
              </CardTitle>
              <CardDescription>
                Add Relay to your home screen
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Relay works as a Progressive Web App. On iOS, tap the Share button and select 
                &quot;Add to Home Screen&quot;. On Android, tap the menu and select &quot;Install App&quot;.
              </p>
              <Badge variant="secondary">Works Offline</Badge>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-lg text-destructive">Danger Zone</CardTitle>
              <CardDescription>
                Irreversible actions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Delete Account</p>
                  <p className="text-sm text-muted-foreground">
                    Permanently delete your account and all data
                  </p>
                </div>
                <Button variant="destructive">Delete Account</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
