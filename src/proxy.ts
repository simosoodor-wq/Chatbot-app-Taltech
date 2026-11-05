import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, accessToken, sameValue } from "@/lib/access";

export async function proxy(request: NextRequest) {
  const code = process.env.APP_ACCESS_CODE;
  const cookie = request.cookies.get(ACCESS_COOKIE)?.value;
  if (code && cookie && sameValue(cookie, await accessToken(code))) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sisesta ligipääsukood." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/sisene", request.url));
}

export const config = {
  matcher: ["/((?!sisene|api/access|_next/|favicon.ico).*)"],
};
