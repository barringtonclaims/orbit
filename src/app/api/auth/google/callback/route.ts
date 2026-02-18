import { NextRequest, NextResponse } from "next/server";
import { 
  exchangeCodeForTokens, 
  storeGoogleTokens, 
  parseAuthState,
  getGmailAddress 
} from "@/lib/google-oauth";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Handle errors from Google
  if (error) {
    console.error("Google OAuth error:", error);
    return NextResponse.redirect(
      new URL(`/settings?tab=integrations&error=google_auth_failed&message=${error}`, request.url)
    );
  }

  // Validate required parameters
  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/settings?tab=integrations&error=google_auth_failed&message=missing_params", request.url)
    );
  }

  // Parse the state to get organizationId and userId
  const authState = parseAuthState(state);
  if (!authState) {
    return NextResponse.redirect(
      new URL("/settings?tab=integrations&error=google_auth_failed&message=invalid_state", request.url)
    );
  }

  const { organizationId, userId } = authState;

  try {
    const tokens = await exchangeCodeForTokens(code);
    const gmailEmail = await getGmailAddress(tokens.access_token);
    await storeGoogleTokens(organizationId, userId, tokens, gmailEmail || undefined);

    return NextResponse.redirect(
      new URL("/settings?tab=integrations&success=google_connected", request.url)
    );
  } catch (err) {
    console.error("Failed to exchange Google tokens:", err);
    return NextResponse.redirect(
      new URL("/settings?tab=integrations&error=google_auth_failed&message=token_exchange_failed", request.url)
    );
  }
}
