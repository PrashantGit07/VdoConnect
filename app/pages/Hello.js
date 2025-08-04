"use client"

import React, { useEffect, useState } from 'react'
import { useSocket } from '../hooks/useSocket'

const Hello = () => {

    const { socket, isConnected } = useSocket()
    const [email, setEmail] = useState('')
    const [roomName, setRoomName] = useState('')


    useEffect(() => {
        if (!socket || !isConnected) return

        const handleConnect = () => {
            console.log("socket is connected and ready");

        }

        socket.on('connect', handleConnect)
        return () => {
            socket.off('connect', handleConnect)
        }
    }, [socket, isConnected])


    const handleJoinRoom = () => {
        if (socket && isConnected) [
            socket.emit("join", {
                roomName: roomName || "HelloRoon",
                email: email || "hello@gmail.com"
            })
        ]
    }

    //socket.emit("join", { roomName: "helloRoom", email: "hello@gmail.com" })


    return (
        <div className="p-4">
            <input
                type="email"
                placeholder="Email..."
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border p-2 mr-2"
            />
            <input
                type="text"
                placeholder="Room name"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                className="border p-2 mr-2"
            />
            <button
                onClick={handleJoinRoom}
                className="bg-blue-500 text-white p-2 rounded"
                disabled={!isConnected}
            >
                {isConnected ? "Enter Room" : "Connecting..."}
            </button>
        </div>
    )
}

export default Hello
