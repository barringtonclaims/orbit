import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, storeGoogleTokens } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // This is the userId
  const error = searchParams.get("error");

  // Handle errors from Google
  if (error) {
    console.error("Google OAuth error:", error);
    return NextResponse.redirect(
      new URL(`/settings?error=google_auth_failed&message=${error}`, request.url)
    );
  }

  // Validate required parameters
  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/settings?error=google_auth_failed&message=missing_params", request.url)
    );
  }

  try {
    // Exchange the code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Store the tokens for the user
    await storeGoogleTokens(state, tokens);

    // Redirect back to settings with success message
    return NextResponse.redirect(
      new URL("/settings?tab=calendar&success=google_connected", request.url)
    );
  } catch (err) {
    console.error("Failed to exchange Google tokens:", err);
    return NextResponse.redirect(
      new URL("/settings?error=google_auth_failed&message=token_exchange_failed", request.url)
    );
  }
}

