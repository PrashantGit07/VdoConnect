"use client";
import { useSocket } from "@/app/hooks/useSocket";
import { useState, useEffect } from "react";

export default function HomePage() {
    const { socket, isConnected } = useSocket();
    const [email, setEmail] = useState("");
    const [roomName, setRoomName] = useState("");
    const [messages, setMessages] = useState([]);
    const [currentRoom, setCurrentRoom] = useState(null);
    const [roomUsers, setRoomUsers] = useState([]);
    const [isCreator, setIsCreator] = useState(false);
    const [currentUserEmail, setCurrentUserEmail] = useState("");

    useEffect(() => {
        if (!socket) return;

        const handleCreated = (data) => {
            setCurrentRoom(data.roomName);
            setIsCreator(true);
            setCurrentUserEmail(data.email);
            setRoomUsers([data.email]);
            const msg = `You created room ${data.roomName}`;
            setMessages(prev => [...prev, msg]);
        };

        const handleJoined = (data) => {
            setCurrentRoom(data.roomName);
            setCurrentUserEmail(data.email);
            const msg = `You joined room ${data.roomName}`;
            setMessages(prev => [...prev, msg]);
        };

        const handleUserJoined = (data) => {
            // Only add if not already in list
            setRoomUsers(prev =>
                prev.includes(data.email) ? prev : [...prev, data.email]
            );
            // Show different message for self vs others
            const msg = data.email === currentUserEmail
                ? `You joined room ${data.roomName}`
                : `User ${data.email} joined`;
            setMessages(prev => [...prev, msg]);
        };

        const handleUserLeft = (data) => {
            setRoomUsers(prev => prev.filter(email => email !== data.email));
            const msg = data.email === currentUserEmail
                ? `You left room ${data.roomName}`
                : `User ${data.email} left`;
            setMessages(prev => [...prev, msg]);
        };

        const handleKicked = (data) => {
            setCurrentRoom(null);
            setIsCreator(false);
            setRoomUsers([]);
            const msg = `You were kicked from room ${data.roomName}`;
            setMessages(prev => [...prev, msg]);
        };

        const handleFull = (data) => {
            const msg = `Room ${data.roomName} is full`;
            setMessages(prev => [...prev, msg]);
        };

        socket.on("created", handleCreated);
        socket.on("joined", handleJoined);
        socket.on("user-joined", handleUserJoined);
        socket.on("user-left", handleUserLeft);
        socket.on("user-disconnected", handleUserLeft);
        socket.on("kicked", handleKicked);
        socket.on("full", handleFull);

        return () => {
            socket.off("created", handleCreated);
            socket.off("joined", handleJoined);
            socket.off("user-joined", handleUserJoined);
            socket.off("user-left", handleUserLeft);
            socket.off("user-disconnected", handleUserLeft);
            socket.off("kicked", handleKicked);
            socket.off("full", handleFull);
        };
    }, [socket, currentUserEmail]);

    const handleJoinRoom = () => {
        if (socket && isConnected) {
            const room = roomName || "default-room";
            const userEmail = email || "anonymous@example.com";

            socket.emit("join", {
                roomName: room,
                email: userEmail
            });
        }
    };

    const handleLeaveRoom = () => {
        if (socket && currentRoom) {
            socket.emit("leave-room", currentRoom);
            setCurrentRoom(null);
            setIsCreator(false);
            setRoomUsers([]);
        }
    };

    const handleKickUser = (targetEmail) => {
        if (socket && currentRoom && isCreator && targetEmail !== currentUserEmail) {
            socket.emit("kick-user", {
                roomName: currentRoom,
                targetEmail
            });
        }
    };

    return (
        <div className="p-4">
            <h1 className="text-3xl font-bold mb-4">Video Call App</h1>

            {!currentRoom ? (
                <div className="mb-4">
                    <input
                        type="email"
                        placeholder="Email..."
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="border p-2 mr-2"
                        required
                    />
                    <input
                        type="text"
                        placeholder="Room name"
                        value={roomName}
                        onChange={(e) => setRoomName(e.target.value)}
                        className="border p-2 mr-2"
                        required
                    />
                    <button
                        onClick={handleJoinRoom}
                        className="bg-blue-500 cursor-pointer text-white p-2 rounded"
                        disabled={!isConnected}
                    >
                        {isConnected ? "Join Room" : "Connecting..."}
                    </button>
                </div>
            ) : (
                <div className="mb-4">
                    <div className="flex items-center mb-2">
                        <span className="font-semibold">Current Room: {currentRoom}</span>
                        {isCreator && <span className="ml-2 text-sm bg-green-700 text-white px-2 py-1 rounded">(Creator)</span>}
                    </div>

                    <div className="flex gap-2 mb-4">
                        <button
                            onClick={handleLeaveRoom}
                            className="bg-red-500 cursor-pointer text-white p-2 rounded"
                        >
                            Leave Room
                        </button>
                    </div>

                    <div className="mt-4">
                        <h3 className="font-semibold mb-2">Users in Room:</h3>
                        <ul className="border rounded p-2">
                            {roomUsers.length > 0 ? (
                                roomUsers.map((userEmail, index) => (
                                    <li key={index} className="flex justify-between items-center py-1">
                                        <span>
                                            {userEmail}
                                            {userEmail === currentUserEmail && " (You)"}
                                        </span>
                                        {isCreator && userEmail !== currentUserEmail && (
                                            <button
                                                onClick={() => handleKickUser(userEmail)}
                                                className="text-xs bg-red-700 cursor-pointer hover:bg-red-200 px-2 py-1 rounded"
                                            >
                                                Kick
                                            </button>
                                        )}
                                    </li>
                                ))
                            ) : (
                                <li className="text-gray-500">No other users in room</li>
                            )}
                        </ul>
                    </div>
                </div>
            )}

            <div className="mb-4">
                Connection Status: {isConnected ? "Connected" : "Disconnected"}
            </div>

            <div className="border p-4">
                <h2 className="text-xl font-bold mb-2">Events:</h2>
                <ul className="space-y-1">
                    {messages.map((msg, index) => (
                        <li key={index} className="text-sm">{msg}</li>
                    ))}
                </ul>
            </div>
        </div>
    );
}