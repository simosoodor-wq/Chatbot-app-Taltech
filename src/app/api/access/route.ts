import { NextResponse } from "next/server";
import { ACCESS_COOKIE, accessToken, sameValue } from "@/lib/access";
import { errorResponse } from "@/lib/api";

export async function POST(request: Request) {
  const expected = process.env.APP_ACCESS_CODE;
  if (!expected) return errorResponse("Ligipääsukood pole serveris seadistatud.", 503);

  const body = await request.json().catch(() => null);
  const submitted = typeof body?.code === "string" ? body.code : "";
  const token = await accessToken(submitted);
  if (!sameValue(token, await accessToken(expected))) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return errorResponse("Vale ligipääsukood.", 401);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACCESS_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return response;
}
