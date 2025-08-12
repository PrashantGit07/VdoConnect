"use client";
import { useSocket } from "@/app/hooks/useSocket";
import { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";

export default function HomePage() {
    const { socket, isConnected } = useSocket();
    const [email, setEmail] = useState("");
    const [username, setUsername] = useState("");
    const [roomName, setRoomName] = useState("");
    const [roomPassword, setRoomPassword] = useState("");
    const [currentRoom, setCurrentRoom] = useState(null);
    const [roomUsers, setRoomUsers] = useState([]);
    const [isCreator, setIsCreator] = useState(false);
    const [creatorUsername, setCreatorUsername] = useState("");
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);
    const videoRef = useRef(null);

    useEffect(() => {
        const savedEmail = localStorage.getItem("videoChatEmail");
        if (savedEmail) setEmail(savedEmail);

        const savedUsername = localStorage.getItem("videoChatUsername");
        if (savedUsername) setUsername(savedUsername);

        const savedRoom = localStorage.getItem("videoChatCurrentRoom");
        if (savedRoom) setCurrentRoom(savedRoom);

        const savedCreator = localStorage.getItem("videoChatIsCreator");
        if (savedCreator) setIsCreator(savedCreator === "true");

        const savedCreatorUsername = localStorage.getItem("videoChatCreatorUsername");
        if (savedCreatorUsername) setCreatorUsername(savedCreatorUsername);

        const savedRoomUsers = localStorage.getItem("videoChatRoomUsers");
        if (savedRoomUsers) setRoomUsers(JSON.parse(savedRoomUsers));
    }, []);

    useEffect(() => {
        localStorage.setItem("videoChatEmail", email);
        localStorage.setItem("videoChatUsername", username);
        localStorage.setItem("videoChatCurrentRoom", currentRoom || "");
        localStorage.setItem("videoChatIsCreator", isCreator.toString());
        localStorage.setItem("videoChatCreatorUsername", creatorUsername);
        localStorage.setItem("videoChatRoomUsers", JSON.stringify(roomUsers));
    }, [email, username, currentRoom, isCreator, creatorUsername, roomUsers]);

    useEffect(() => {
        if (!socket) return;

        const handleCreated = (data) => {
            setCurrentRoom(data.roomName);
            setIsCreator(true);
            setCreatorUsername(username);
            setRoomUsers([{ email, username }]);
            toast.success(`You created room ${data.roomName}`, { duration: 3000 });
        };

        const handleJoined = (data) => {
            setCurrentRoom(data.roomName);
            if (data.creatorUsername) {
                setCreatorUsername(data.creatorUsername);
            }
            setRoomUsers(data.users.map(u => ({ email: u.email, username: u.username })));
            toast.success(
                `You joined room ${data.roomName} (Created by ${data.creatorUsername || "unknown"})`,
                { duration: 3000 }
            );
        };

        const handleUserJoined = (data) => {
            setRoomUsers(prev => {
                const exists = prev.some(u => u.email === data.email);
                return exists ? prev : [...prev, { email: data.email, username: data.username }];
            });

            if (data.email === email) return;
            toast(`${data.username} joined the room`, { duration: 3000 });
        };

        const handleUserLeft = (data) => {
            const { username: leftUsername, roomName } = data;

            setRoomUsers(prev => prev.filter(user => user.username !== leftUsername));

            if (leftUsername === username) {
                toast.success(`You left room ${roomName}`, { duration: 3000 });
                setCurrentRoom(null);
                setIsCreator(false);
                setCreatorUsername("");
            } else {
                toast(`${leftUsername} left the room`, { duration: 3000 });

                if (leftUsername === creatorUsername) {
                    setCreatorUsername("");
                    toast.error(`Room creator has left`, { duration: 3000 });
                }
            }
        };

        const handleKicked = (data) => {
            toast.error(`You were kicked from room ${data.roomName} by ${data.by}`, { duration: 3000 });

            // Force immediate state reset to go back to join room UI
            setCurrentRoom(null);
            setIsCreator(false);
            setCreatorUsername("");
            setRoomUsers([]);
            setRoomName("");
            setRoomPassword("");

            // Force update localStorage immediately
            localStorage.setItem("videoChatCurrentRoom", "");
            localStorage.setItem("videoChatIsCreator", "false");
            localStorage.setItem("videoChatCreatorUsername", "");
            localStorage.setItem("videoChatRoomUsers", "[]");
        };

        const handleFull = (data) => {
            toast.error(`Room ${data.roomName} is full`, { duration: 3000 });
        };

        const handleError = (data) => {
            toast.error(`Error: ${data.message}`, { duration: 3000 });
        };

        socket.on("created", handleCreated);
        socket.on("joined", handleJoined);
        socket.on("user-joined", handleUserJoined);
        socket.on("user-left", handleUserLeft);
        socket.on("user-disconnected", handleUserLeft);
        socket.on("kicked", handleKicked);
        socket.on("full", handleFull);
        socket.on("error", handleError);

        return () => {
            socket.off("created", handleCreated);
            socket.off("joined", handleJoined);
            socket.off("user-joined", handleUserJoined);
            socket.off("user-left", handleUserLeft);
            socket.off("user-disconnected", handleUserLeft);
            socket.off("kicked", handleKicked);
            socket.off("full", handleFull);
            socket.off("error", handleError);
        };
    }, [socket, email, username, creatorUsername]);

    const handleJoinRoom = () => {
        if (socket && isConnected && email && username) {
            const room = roomName || "default-room";
            const password = roomPassword || "";

            socket.emit("join", {
                roomName: room,
                email: email,
                password: password
            });
        }
    };

    const handleLeaveRoom = () => {
        if (socket && currentRoom) {
            socket.emit("leaveRoom", currentRoom);
            setCurrentRoom(null);
            setIsCreator(false);
            setCreatorUsername("");
            setRoomUsers([]);
            toast.success(`You left room ${currentRoom}`, { duration: 3000 });
        }
    };

    const handleKickUser = (targetEmail) => {
        if (socket && currentRoom && isCreator && targetEmail !== email) {
            socket.emit("kick-user", {
                roomName: currentRoom,
                targetEmail
            });

            setRoomUsers(prev => prev.filter(user => user.email !== targetEmail));
            const targetUser = roomUsers.find(u => u.email === targetEmail);
            toast.success(`You kicked ${targetUser?.username || targetEmail} from the room`, { duration: 3000 });
        }
    };

    const handleToggleMute = () => {
        setIsMuted(!isMuted);
        toast.success(isMuted ? "Microphone unmuted" : "Microphone muted", { duration: 2000 });
    };

    const handleToggleCamera = () => {
        setIsCameraOff(!isCameraOff);
        toast.success(isCameraOff ? "Camera turned on" : "Camera turned off", { duration: 2000 });
    };

    const clearLocalStorage = () => {
        localStorage.removeItem("videoChatEmail");
        localStorage.removeItem("videoChatUsername");
        localStorage.removeItem("videoChatCurrentRoom");
        localStorage.removeItem("videoChatIsCreator");
        localStorage.removeItem("videoChatCreatorUsername");
        localStorage.removeItem("videoChatRoomUsers");
        toast.success("Cleared all saved data", { duration: 3000 });
    };

    // Helper function to get the appropriate message for the video area
    const getVideoAreaMessage = () => {
        if (isCreator) {
            return "Your stream will appear here";
        }

        if (!creatorUsername) {
            return "The organizer has left the room";
        }

        return `Waiting for ${creatorUsername}'s stream`;
    };

    return (
        <div className="p-4 max-w-6xl mx-auto text-white">
            <h1 className="text-3xl font-bold mb-4 text-white">Video Call App</h1>

            {!currentRoom ? (
                <div className="mb-4 p-4 border border-gray-600 rounded bg-gray-800 text-white">
                    <div className="mb-3">
                        <label className="block mb-1 font-medium text-white">Your Email</label>
                        <input
                            type="email"
                            placeholder="Enter your email..."
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full border border-gray-600 bg-gray-700 text-white p-2 rounded placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>
                    <div className="mb-3">
                        <label className="block mb-1 font-medium text-white">Your Username</label>
                        <input
                            type="text"
                            placeholder="Enter your username..."
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full border border-gray-600 bg-gray-700 text-white p-2 rounded placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>
                    <div className="mb-3">
                        <label className="block mb-1 font-medium text-white">Room Name</label>
                        <input
                            type="text"
                            placeholder="Enter room name (leave blank for default)"
                            value={roomName}
                            onChange={(e) => setRoomName(e.target.value)}
                            className="w-full border border-gray-600 bg-gray-700 text-white p-2 rounded placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div className="mb-3">
                        <label className="block mb-1 font-medium text-white">Room Password</label>
                        <input
                            type="password"
                            placeholder="Enter password (required for existing rooms)"
                            value={roomPassword}
                            onChange={(e) => setRoomPassword(e.target.value)}
                            className="w-full border border-gray-600 bg-gray-700 text-white p-2 rounded placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <button
                        onClick={handleJoinRoom}
                        className="bg-blue-500 hover:bg-blue-600 cursor-pointer text-white p-2 rounded w-full disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!isConnected || !email || !username}
                    >
                        {isConnected ? "Join Room" : "Connecting..."}
                    </button>
                </div>
            ) : (
                <div className="border border-gray-600 rounded overflow-hidden bg-gray-800">
                    <div className="flex justify-between items-center p-4 bg-gray-700 border-b border-gray-600">
                        <div>
                            <span className="font-semibold text-white">Room: {currentRoom}</span>
                            {isCreator && (
                                <span className="ml-2 text-sm bg-green-700 text-white px-2 py-1 rounded">
                                    (You are the creator)
                                </span>
                            )}
                            {!isCreator && creatorUsername && (
                                <span className="ml-2 text-sm bg-blue-700 text-white px-2 py-1 rounded">
                                    (Created by {creatorUsername})
                                </span>
                            )}
                            {!isCreator && !creatorUsername && (
                                <span className="ml-2 text-sm bg-red-700 text-white px-2 py-1 rounded">
                                    (Organizer left)
                                </span>
                            )}
                        </div>
                        <button
                            onClick={handleLeaveRoom}
                            className="bg-red-500 hover:bg-red-600 cursor-pointer text-white p-2 rounded"
                        >
                            Leave Room
                        </button>
                    </div>

                    <div className="flex">
                        {/* Left sidebar - Users list */}
                        <div className="w-1/4 border-r border-gray-600 p-4 bg-gray-750 h-[calc(100vh-200px)] overflow-y-auto text-white">
                            <h3 className="font-semibold mb-4 text-white">Participants ({roomUsers.length})</h3>
                            <ul className="space-y-2">
                                {roomUsers.map((user, index) => (
                                    <li key={index} className="flex justify-between items-center p-2 rounded hover:bg-gray-600 bg-gray-700">
                                        <span className={`${user.email === email ? "font-medium text-blue-300" : "text-white"}`}>
                                            {user.username}
                                            {user.email === email && " (You)"}
                                            {user.username === creatorUsername && " 👑"}
                                        </span>
                                        {isCreator && user.email !== email && (
                                            <button
                                                onClick={() => handleKickUser(user.email)}
                                                className="text-sm bg-red-600 hover:bg-red-700 cursor-pointer text-white px-3 py-1 rounded"
                                            >
                                                Kick
                                            </button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Main video area */}
                        <div className="w-3/4 p-4 bg-gray-700 h-[calc(100vh-200px)] flex flex-col">
                            <div className="flex-1 bg-black rounded-lg overflow-hidden relative flex items-center justify-center text-white">
                                {/* Streaming box placeholder */}
                                <div className="w-full h-full flex items-center justify-center">
                                    <div className="text-center">
                                        <p className="text-white text-xl">
                                            {getVideoAreaMessage()}
                                        </p>
                                        <video
                                            ref={videoRef}
                                            autoPlay
                                            muted={isMuted}
                                            playsInline
                                            className={`${isCameraOff ? 'hidden' : 'block'} max-w-full max-h-full`}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Controls */}
                            <div className="mt-4 flex justify-center space-x-4">
                                <button
                                    onClick={handleToggleMute}
                                    className={`${isMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'} text-white p-2 rounded`}
                                >
                                    {isMuted ? 'Unmute' : 'Mute'}
                                </button>
                                <button
                                    onClick={handleToggleCamera}
                                    className={`${isCameraOff ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'} text-white p-2 rounded`}
                                >
                                    {isCameraOff ? 'Camera On' : 'Camera Off'}
                                </button>
                                <button
                                    onClick={handleLeaveRoom}
                                    className="bg-red-500 hover:bg-red-600 text-white p-2 rounded"
                                >
                                    Leave Meeting
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="mt-2 flex justify-between items-center">
                <span className={`inline-block px-2 py-1 rounded text-sm ${isConnected ? "bg-green-700 text-green-200" : "bg-red-700 text-red-200"}`}>
                    {isConnected ? "Connected to server" : "Disconnected"}
                </span>
                <button
                    onClick={clearLocalStorage}
                    className="text-sm text-gray-300 hover:text-white transition-colors"
                    title="Clear all saved data"
                >
                    Clear Data
                </button>
            </div>
        </div>
    );
}