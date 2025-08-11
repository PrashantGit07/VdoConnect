import { ConnectDb } from "@/app/config/ConnectDb/ConnectDb";
import { UserModel } from "@/app/config/Models/UserModel";
import { generatToken } from "@/app/utils/JwtUtils";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
export async function POST(request) {
    await ConnectDb();

    try {

        const { email, password } = await request.json();
        if (!email || !password) {
            return NextResponse.json({
                message: "Email and password are required"
            }, { status: 400 });
        }

        const existingUser = await UserModel.findOne({ email });
        if (!existingUser) {
            return NextResponse.json({
                message: "User not found"
            }, { status: 404 });
        }


        const correctPassword = await bcrypt.compare(password, existingUser.password)


        if (!correctPassword) {
            return NextResponse.json({
                message: "Invalid password"
            }, { status: 401 });
        }

        const token = await generatToken(existingUser._id)

        const response = new NextResponse(
            JSON.stringify({
                message: "Login successful",
                user: {
                    id: existingUser._id,
                    username: existingUser.username,
                    email: existingUser.email,
                    token
                }
            }),
            { status: 200 }
        )

        response.cookies.set({
            name: "auth-token",
            value: token,
            httpOnly: true,
            sameSite: "strict",
            maxAge: 86400
        })

        return response;
    }
    catch (e) {
        console.log(e)
        return NextResponse.json({
            message: "Error connecting to database"
        }, { status: 500 }, { error: e });
    }
}