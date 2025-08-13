// app/api/auth/me/route.js
import { ConnectDb } from "@/app/config/ConnectDb/ConnectDb";
import { UserModel } from "@/app/config/Models/UserModel";
import { verifyToken } from "@/app/utils/JwtUtils";
import { NextResponse } from "next/server";

export async function GET(request) {
    await ConnectDb();

    try {

        const token = request.cookies.get('auth-token')?.value;

        if (!token) {
            return NextResponse.json({
                message: "No authentication token found"
            }, { status: 401 });
        }


        const decoded = await verifyToken(token);
        if (!decoded) {
            return NextResponse.json({
                message: "Invalid or expired token"
            }, { status: 401 });
        }


        const user = await UserModel.findById(decoded.userId).select('-password');
        if (!user) {
            return NextResponse.json({
                message: "User not found"
            }, { status: 404 });
        }

        return NextResponse.json({
            message: "User details retrieved successfully",
            user: {
                id: user._id,
                username: user.username,
                email: user.email
            }
        }, { status: 200 });

    } catch (error) {
        console.error("Get current user error:", error);
        return NextResponse.json({
            message: "Error retrieving user details",
            error: error.message
        }, { status: 500 });
    }
}