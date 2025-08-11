import { ConnectDb } from "@/app/config/ConnectDb/ConnectDb";
import { UserModel } from "@/app/config/Models/UserModel";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs"
export async function POST(request) {
    await ConnectDb();

    try {

        const { username, email, password } = await request.json();

        if (!email || !password) {
            return NextResponse.json({
                message: "Email and password are required"
            }, { status: 400 });
        }



        const existingUser = await UserModel.findOne({ email });

        if (existingUser) {
            return NextResponse.json({
                message: "User already exists"
            }, { status: 409 });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new UserModel({ username, email, password: hashedPassword });
        await newUser.save();

        return NextResponse.json({
            message: "User created successfully",
            user: {
                id: newUser._id,
                username: newUser.username,
                email: newUser.email
            }
        }, { status: 201 });
    }
    catch (e) {
        console.log(e)
        return NextResponse.json({
            message: "Error connecting to database"
        }, { status: 500 }, { error: e });
    }
}