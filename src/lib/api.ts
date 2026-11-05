import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

export const DB_ERROR = "Andmebaasiga ei saa praegu ühendust. Proovi hetke pärast uuesti.";

export function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export function isDatabaseError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError ||
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code.startsWith("P1"))
  );
}

/** Wraps a route so an unreachable database produces a readable message, not a crash. */
export async function handle(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    console.error(error);
    if (isDatabaseError(error)) return errorResponse(DB_ERROR, 503);
    return errorResponse("Midagi läks valesti. Proovi uuesti.", 500);
  }
}

export function isNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
