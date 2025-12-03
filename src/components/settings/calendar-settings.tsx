"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getGoogleCalendarAuthUrl, disconnectGoogleCalendarAction } from "@/lib/actions/calendar";
import { 
  Calendar, 
  Check, 
  ExternalLink, 
  Loader2, 
  Unlink,
  AlertCircle,
} from "lucide-react";

interface CalendarSettingsProps {
  isGoogleConnected: boolean;
}

export function CalendarSettings({ isGoogleConnected }: CalendarSettingsProps) {
  const router = useRouter();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const result = await getGoogleCalendarAuthUrl();
      if (result.error || !result.data) {
        toast.error("Failed to get authorization URL");
        return;
      }
      // Redirect to Google OAuth
      window.location.href = result.data;
    } catch {
      toast.error("Failed to connect Google Calendar");
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      const result = await disconnectGoogleCalendarAction();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Google Calendar disconnected");
      router.refresh();
    } catch {
      toast.error("Failed to disconnect");
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Google Calendar
          </CardTitle>
          <CardDescription>
            Sync your inspection appointments with Google Calendar
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                isGoogleConnected ? "bg-green-100" : "bg-muted"
              }`}>
                <svg 
                  className={`w-6 h-6 ${isGoogleConnected ? "text-green-600" : "text-muted-foreground"}`} 
                  viewBox="0 0 24 24" 
                  fill="currentColor"
                >
                  <path d="M19.5 3h-15A1.5 1.5 0 003 4.5v15A1.5 1.5 0 004.5 21h15a1.5 1.5 0 001.5-1.5v-15A1.5 1.5 0 0019.5 3zM19 19H5V8h14v11zM7 10h2v2H7v-2zm4 0h2v2h-2v-2zm4 0h2v2h-2v-2zM7 14h2v2H7v-2zm4 0h2v2h-2v-2z"/>
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">Google Calendar</p>
                  {isGoogleConnected ? (
                    <Badge variant="default" className="gap-1 bg-green-600">
                      <Check className="w-3 h-3" />
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Not Connected</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {isGoogleConnected 
                    ? "Inspection appointments will sync automatically"
                    : "Connect to sync inspections with your calendar"}
                </p>
              </div>
            </div>
            
            {isGoogleConnected ? (
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
                Connect
              </Button>
            )}
          </div>

          {isGoogleConnected && (
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium text-sm mb-2">What gets synced:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-600" />
                  Scheduled inspections are added to your calendar
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-600" />
                  Reminders are set for 30 min and 1 day before
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-600" />
                  Contact address is included as the event location
                </li>
              </ul>
            </div>
          )}

          {!isGoogleConnected && (
            <div className="p-4 border border-dashed rounded-lg">
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Setup Required
              </h4>
              <p className="text-sm text-muted-foreground">
                To enable Google Calendar sync, you need to configure the following 
                environment variables:
              </p>
              <ul className="text-sm text-muted-foreground mt-2 space-y-1 font-mono">
                <li>• GOOGLE_CLIENT_ID</li>
                <li>• GOOGLE_CLIENT_SECRET</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-2">
                Create credentials at{" "}
                <a 
                  href="https://console.cloud.google.com/apis/credentials" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Google Cloud Console
                </a>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Future: Other Calendar Features */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Calendar Preferences</CardTitle>
          <CardDescription>
            Configure how appointments appear in your calendar
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
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Calendar Notifications</p>
              <p className="text-sm text-muted-foreground">
                Reminders before appointments
              </p>
            </div>
            <Badge variant="secondary">30 min & 1 day</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

