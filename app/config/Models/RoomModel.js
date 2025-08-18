import mongoose from 'mongoose';
const RoomModel = new mongoose.Schema({
    roomName: {
        type: String,
    },
    roomPassword: {
        type: String,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    joinees: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: 'User'
    }
})

export const Room =
    mongoose.models.Room || mongoose.model("Room", RoomModel);