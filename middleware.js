import { NextResponse } from "next/server";

export function middleware(req) {
    const res = NextResponse.next();
    res.headers.set("ngrok-skip-browser-warning", "true");
    return res;
}
