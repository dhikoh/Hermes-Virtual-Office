import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  COOKIE_NAME,
  getAuthConfig,
  isValidSessionCookie,
} from "@/lib/auth/session";

export async function GET() {
  const { isAuthEnabled, username } = getAuthConfig();

  if (!isAuthEnabled) {
    return NextResponse.json({
      authEnabled: false,
      authenticated: true,
      user: "guest",
    });
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(COOKIE_NAME)?.value;
  const authenticated = isValidSessionCookie(sessionCookie);

  return NextResponse.json({
    authEnabled: true,
    authenticated,
    user: authenticated ? username : null,
  });
}
