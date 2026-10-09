import { NextResponse } from "next/server";
import {
  COOKIE_NAME,
  getAuthConfig,
  hashSessionToken,
  SESSION_MAX_AGE_SECONDS,
  verifyCredentials,
} from "@/lib/auth/session";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username = "", password = "" } = body ?? {};

    const { isAuthEnabled, password: secretPassword, username: expectedUser } = getAuthConfig();

    if (!isAuthEnabled) {
      return NextResponse.json({
        success: true,
        message: "Authentication is not enabled on this server.",
      });
    }

    if (!verifyCredentials(String(username), String(password))) {
      return NextResponse.json(
        { error: "Username atau password salah." },
        { status: 401 }
      );
    }

    const sessionHash = hashSessionToken(secretPassword);
    const response = NextResponse.json({
      success: true,
      user: expectedUser,
    });

    const isProduction = process.env.NODE_ENV === "production";

    response.cookies.set({
      name: COOKIE_NAME,
      value: sessionHash,
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return response;
  } catch (error) {
    console.error("[Auth Login Error]", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan saat memproses login." },
      { status: 500 }
    );
  }
}
