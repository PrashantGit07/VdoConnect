"use client";
import { useSocket } from "@/app/hooks/useSocket";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

export default function JoinRoomPage() {
    const { socket, isConnected } = useSocket();
    const [email, setEmail] = useState("");
    const [username, setUsername] = useState("");
    const [roomName, setRoomName] = useState("");
    const [roomPassword, setRoomPassword] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const router = useRouter();

    // Fetch current user details on component mount
    useEffect(() => {
        const fetchCurrentUser = async () => {
            try {
                const response = await fetch('/api/user/me', {
                    method: 'GET',
                    credentials: 'include',
                });

                if (response.ok) {
                    const data = await response.json();
                    setEmail(data.user.email);
                    setUsername(data.user.username);
                    setIsAuthenticated(true);
                } else {
                    setIsAuthenticated(false);
                    toast.error("Please login to use video chat", { duration: 3000 });
                    window.location.href = '/';
                }
            } catch (error) {
                console.error("Error fetching current user:", error);
                setIsAuthenticated(false);
                toast.error("Authentication failed", { duration: 3000 });
                window.location.href = '/';
            } finally {
                setIsLoading(false);
            }
        };

        fetchCurrentUser();
    }, []);

    // Socket event handlers
    useEffect(() => {
        if (!socket || !isAuthenticated) return;

        const handleCreated = (data) => {
            router.push(`/pages/streaming/${data.roomDetails.id}`);
        };

        const handleJoined = (data) => {
            router.push(`/pages/streaming/${data.roomDetails.id}`);
        };

        const handleError = (data) => {
            toast.error(`Error: ${data.message}`, { duration: 3000 });
        };

        const handleFull = (data) => {
            toast.error(`Room ${data.roomName} is full`, { duration: 3000 });
        };

        socket.on("created", handleCreated);
        socket.on("joined", handleJoined);
        socket.on("error", handleError);
        socket.on("full", handleFull);

        return () => {
            socket.off("created", handleCreated);
            socket.off("joined", handleJoined);
            socket.off("error", handleError);
            socket.off("full", handleFull);
        };
    }, [socket, isAuthenticated, router]);

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

    const handleLogout = async () => {
        try {
            await fetch('/api/user/logout', {
                method: 'POST',
                credentials: 'include'
            });
            window.location.href = '/';
        } catch (error) {
            console.error("Logout error:", error);
            window.location.href = '/';
        }
    };

    // Loading state
    if (isLoading) {
        return (
            <div className="p-4 max-w-6xl mx-auto text-white flex justify-center items-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-white mx-auto"></div>
                    <p className="mt-4 text-xl">Loading...</p>
                </div>
            </div>
        );
    }

    // Not authenticated state
    if (!isAuthenticated) {
        return (
            <div className="p-4 max-w-6xl mx-auto text-white flex justify-center items-center min-h-screen">
                <div className="text-center">
                    <h1 className="text-3xl font-bold mb-4">Authentication Required</h1>
                    <p className="mb-4">Please login to access the video chat</p>
                    <button
                        onClick={() => window.location.href = '/'}
                        className="bg-blue-500 hover:bg-blue-600 cursor-pointer text-white p-3 rounded"
                    >
                        Go to Login
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 max-w-6xl mx-auto text-white">
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-3xl font-bold text-white">Video Call App</h1>
                <div className="flex items-center space-x-4">
                    <span className="text-sm">Welcome, {username}!</span>
                    <button
                        onClick={handleLogout}
                        className="bg-red-500 hover:bg-red-600 cursor-pointer text-white px-3 py-1 rounded text-sm"
                    >
                        Logout
                    </button>
                </div>
            </div>

            <div className="mb-4 p-4 border border-gray-600 rounded bg-gray-800 text-white">
                <div className="mb-4 p-3 bg-gray-700 rounded">
                    <p><strong>Logged in as:</strong> {username} ({email})</p>
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
                    disabled={!isConnected}
                >
                    {isConnected ? "Join Room" : "Connecting..."}
                </button>
            </div>

            <div className="mt-2">
                <span className={`inline-block px-2 py-1 rounded text-sm ${isConnected ? "bg-green-700 text-green-200" : "bg-red-700 text-red-200"}`}>
                    {isConnected ? "Connected to server" : "Disconnected"}
                </span>
            </div>
        </div>
    );
}