import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
    username: {
        type: String,
    },
    email: {
        type: String,
        unique: true,
        required: true,
    },
    password: {
        type: String,
        required: true,
    }
})
export const UserModel =
    mongoose.models.User || mongoose.model("User", UserSchema);