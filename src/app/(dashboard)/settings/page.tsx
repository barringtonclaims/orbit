import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getOrganization } from "@/lib/actions/organizations";
import { getTemplates } from "@/lib/actions/templates";
import { checkGoogleCalendarConnection } from "@/lib/actions/calendar";
import { ScheduleSettings } from "@/components/settings/schedule-settings";
import { TemplateSettings } from "@/components/settings/template-settings";
import { CalendarSettings } from "@/components/settings/calendar-settings";
import { StageSettings } from "@/components/settings/stage-settings";
import { 
  User, 
  Mail, 
  Bell, 
  Palette, 
  Shield, 
  Smartphone,
  Check,
  FileText,
  Calendar,
  Settings2,
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
  
  const [orgResult, templatesResult, calendarResult] = await Promise.all([
    getOrganization(),
    getTemplates(),
    checkGoogleCalendarConnection(),
  ]);

  const org = orgResult.data;
  const templates = templatesResult.data || [];
  const isGoogleConnected = calendarResult.data?.isConnected || false;

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
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          Google Calendar connected successfully!
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error === "google_auth_failed" 
            ? "Failed to connect Google Calendar. Please try again." 
            : error}
        </div>
      )}

      <Tabs defaultValue={defaultTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="general" className="gap-2">
            <Settings2 className="w-4 h-4" />
            <span className="hidden sm:inline">General</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Templates</span>
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-2">
            <Calendar className="w-4 h-4" />
            <span className="hidden sm:inline">Calendar</span>
          </TabsTrigger>
          <TabsTrigger value="account" className="gap-2">
            <User className="w-4 h-4" />
            <span className="hidden sm:inline">Account</span>
          </TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-6">
          {/* Profile */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="w-5 h-5" />
                Profile
              </CardTitle>
              <CardDescription>
                Your personal information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input id="fullName" placeholder="John Doe" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="john@example.com" disabled />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Company Name</Label>
                <Input id="company" placeholder="Your Roofing Company" />
              </div>
              <Button>Save Changes</Button>
            </CardContent>
          </Card>

          {/* Schedule Configuration */}
          {org && (
            <ScheduleSettings 
              initialOfficeDays={org.officeDays}
              initialInspectionDays={org.inspectionDays}
            />
          )}

          {/* Stage Settings */}
          <StageSettings />

          {/* Appearance */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Palette className="w-5 h-5" />
                Appearance
              </CardTitle>
              <CardDescription>
                Customize how Orbit looks
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

        {/* Templates Settings */}
        <TabsContent value="templates">
          <Suspense fallback={<div>Loading templates...</div>}>
            <TemplateSettings templates={templates} />
          </Suspense>
        </TabsContent>

        {/* Calendar Settings */}
        <TabsContent value="calendar">
          <Suspense fallback={<div>Loading calendar settings...</div>}>
            <CalendarSettings isGoogleConnected={isGoogleConnected} />
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
                Add Orbit to your home screen
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Orbit works as a Progressive Web App. On iOS, tap the Share button and select 
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
