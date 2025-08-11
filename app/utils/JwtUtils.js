import { NextResponse } from "next/server"
import jwt from "jsonwebtoken"

export const generatToken = async (userId) => {
    try {
        if (!userId) {
            return NextResponse.json({
                message: "User ID is required"
            }, { status: 400 });
        }

        return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1d' })
    }
    catch (e) {
        return NextResponse.json({
            message: "Error generating token"
        }, { status: 500 }, { error: e })
    }
}



export const verifyToken = async (token) => {
    if (!process.env.JWT_SECRET) {
        return NextResponse.json({
            message: "JWT secret is not defined"
        }, { status: 500 });
    }
    try {
        if (!token) {
            return NextResponse.json({
                message: "Token is required"
            }, { status: 400 });
        }

        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        return NextResponse.json({
            message: "Invalid token",
            error: error.message
        }, { status: 401 });
    }
}