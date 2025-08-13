// app/api/auth/logout/route.js
import { NextResponse } from "next/server";

export async function POST() {
    try {
        const response = NextResponse.json({
            message: "Logout successful"
        }, { status: 200 });


        response.cookies.set({
            name: "auth-token",
            value: "",
            httpOnly: true,
            sameSite: "strict",
            maxAge: 0,
            expires: new Date(0)
        });

        return response;
    } catch (error) {
        console.error("Logout error:", error);
        return NextResponse.json({
            message: "Error during logout"
        }, { status: 500 });
    }
}