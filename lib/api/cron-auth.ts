import { NextRequest } from "next/server";

export function isCronAuthorized(request: NextRequest): boolean {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${expectedSecret}`) {
    return true;
  }

  const secretParam = request.nextUrl.searchParams.get("secret");
  return secretParam === expectedSecret;
}
