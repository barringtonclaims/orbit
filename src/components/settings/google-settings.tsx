"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { 
  Check, 
  ExternalLink, 
  Loader2, 
  Unlink,
  Calendar,
  Mail,
  Bot,
  Sparkles,
} from "lucide-react";

interface GoogleSettingsProps {
  isConnected: boolean;
  hasCalendarAccess: boolean;
  hasGmailAccess: boolean;
  lastGmailSyncAt: string | null;
  authUrl: string;
  userEmail?: string;
}

export function GoogleSettings({
  isConnected,
  hasCalendarAccess,
  hasGmailAccess,
  lastGmailSyncAt,
  authUrl,
  userEmail,
}: GoogleSettingsProps) {
  const router = useRouter();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    // Redirect to Google OAuth
    window.location.href = authUrl;
  };

  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect your Google account? This will disable Calendar sync and Josh email processing.")) {
      return;
    }
    
    setIsDisconnecting(true);
    try {
      const response = await fetch("/api/auth/google/disconnect", { method: "POST" });
      if (response.ok) {
        toast.success("Google account disconnected");
        router.refresh();
      } else {
        toast.error("Failed to disconnect");
      }
    } catch {
      toast.error("Failed to disconnect");
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch("/api/josh/sync", { method: "POST" });
      if (response.ok) {
        const data = await response.json();
        toast.success(`Synced! Processed ${data.processed || 0} emails`);
        router.refresh();
      } else {
        toast.error("Sync failed");
      }
    } catch {
      toast.error("Sync failed");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Main Google Account Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google Account
          </CardTitle>
          <CardDescription>
            Connect your Google account to enable Calendar sync and Josh AI email processing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Connection Status */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                isConnected ? "bg-green-100 dark:bg-green-900/30" : "bg-muted"
              }`}>
                <svg 
                  className={`w-6 h-6 ${isConnected ? "text-green-600" : "text-muted-foreground"}`} 
                  viewBox="0 0 24 24"
                >
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">Google Account</p>
                  {isConnected ? (
                    <Badge variant="default" className="gap-1 bg-green-600">
                      <Check className="w-3 h-3" />
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Not Connected</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {isConnected 
                    ? userEmail || "Calendar sync and email processing enabled"
                    : "Connect to enable all Google features"}
                </p>
              </div>
            </div>
            
            {isConnected ? (
              <Button 
                variant="outline" 
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="gap-2 text-destructive hover:text-destructive"
              >
                {isDisconnecting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Unlink className="w-4 h-4" />
                )}
                Disconnect
              </Button>
            ) : (
              <Button 
                onClick={handleConnect}
                disabled={isConnecting}
                className="gap-2"
              >
                {isConnecting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4" />
                )}
                Connect Google
              </Button>
            )}
          </div>

          {/* Features Enabled */}
          {isConnected && (
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Calendar Feature */}
              <div className={`p-4 rounded-lg border ${hasCalendarAccess ? "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800" : "bg-muted"}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className={`w-5 h-5 ${hasCalendarAccess ? "text-blue-600" : "text-muted-foreground"}`} />
                  <p className="font-medium">Calendar Sync</p>
                  {hasCalendarAccess && (
                    <Badge variant="outline" className="text-xs bg-blue-100 dark:bg-blue-900/30 border-blue-300">
                      <Check className="w-3 h-3 mr-1" />
                      Active
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {hasCalendarAccess 
                    ? "Inspection appointments sync to your Google Calendar"
                    : "Calendar sync not enabled"}
                </p>
              </div>

              {/* Gmail/Josh Feature */}
              <div className={`p-4 rounded-lg border ${hasGmailAccess ? "bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800" : "bg-muted"}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Bot className={`w-5 h-5 ${hasGmailAccess ? "text-purple-600" : "text-muted-foreground"}`} />
                  <p className="font-medium">Josh Email Processing</p>
                  {hasGmailAccess && (
                    <Badge variant="outline" className="text-xs bg-purple-100 dark:bg-purple-900/30 border-purple-300">
                      <Sparkles className="w-3 h-3 mr-1" />
                      Active
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {hasGmailAccess 
                    ? "Josh automatically processes your incoming emails"
                    : "Email processing not enabled"}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Josh AI Details (only when connected with Gmail) */}
      {isConnected && hasGmailAccess && (
        <Card className="border-purple-200 dark:border-purple-800 bg-gradient-to-r from-purple-50/50 to-blue-50/50 dark:from-purple-950/20 dark:to-blue-950/20">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white">
                <Bot className="w-4 h-4" />
              </div>
              Josh AI Assistant
              <Sparkles className="w-4 h-4 text-purple-500" />
            </CardTitle>
            <CardDescription>
              Your AI assistant that automatically processes incoming emails
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Sync Status */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Last Email Sync</p>
                <p className="text-sm text-muted-foreground">
                  {lastGmailSyncAt 
                    ? new Date(lastGmailSyncAt).toLocaleString()
                    : "Never synced"}
                </p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSyncNow}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4 mr-2" />
                )}
                Sync Now
              </Button>
            </div>

            <Separator />

            {/* What Josh Does */}
            <div>
              <p className="font-medium text-sm mb-2">What Josh Does</p>
              <ul className="text-sm text-muted-foreground space-y-1.5">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  Creates leads from AccuLynx notifications automatically
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  Links incoming emails to existing contacts
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  Alerts you when carriers email about claims
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  Creates new leads from potential customer emails
                </li>
              </ul>
            </div>

            <Separator />

            {/* Auto-sync info */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Auto-sync frequency</span>
              <Badge variant="secondary">Every 5 minutes</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Calendar Details (only when connected with Calendar) */}
      {isConnected && hasCalendarAccess && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Calendar Sync Settings
            </CardTitle>
            <CardDescription>
              Configure how appointments sync to your calendar
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Default Inspection Duration</p>
                <p className="text-sm text-muted-foreground">
                  How long inspections appear on your calendar
                </p>
              </div>
              <Badge variant="secondary">1 hour</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Calendar Notifications</p>
                <p className="text-sm text-muted-foreground">
                  Reminders before appointments
                </p>
              </div>
              <Badge variant="secondary">30 min & 1 day</Badge>
            </div>
            <Separator />
            <div>
              <p className="font-medium text-sm mb-2">What gets synced</p>
              <ul className="text-sm text-muted-foreground space-y-1.5">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-600" />
                  Scheduled inspections are added to your calendar
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-600" />
                  Contact address is included as the event location
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-600" />
                  Appointment updates sync automatically
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Not Connected Info */}
      {!isConnected && (
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-muted-foreground" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              </div>
              <h3 className="font-semibold mb-2">Connect Your Google Account</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                One connection enables both Calendar sync for your inspections and 
                Josh AI to automatically process your incoming emails.
              </p>
              <Button onClick={handleConnect} disabled={isConnecting} className="gap-2">
                {isConnecting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4" />
                )}
                Connect Google Account
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

