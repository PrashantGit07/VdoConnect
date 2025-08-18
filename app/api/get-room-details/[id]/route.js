
import mongoose from 'mongoose';
import { Room } from '../../../config/Models/RoomModel';
import { UserModel } from '../../../config/Models/UserModel';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
    try {
        const { id } = await params;


        if (!mongoose.Types.ObjectId.isValid(id)) {
            return Response.json(
                { error: 'Invalid room ID format' },
                { status: 400 }
            );
        }


        const room = await Room.findById(id)
            .populate('createdBy', 'username email')
            .populate('joinees', 'username email');

        if (!room) {
            return NextResponse.json(
                { error: 'Room not found' },
                { status: 404 }
            );
        }


        return Response.json({
            success: true,
            room: {
                id: room._id,
                roomName: room.roomName,
                createdBy: room.createdBy,
                joinees: room.joinees,
                joineeCount: room.joinees.length,
                createdAt: room.createdAt,
                updatedAt: room.updatedAt
            }
        });

    } catch (error) {
        console.error('Error fetching room details:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}