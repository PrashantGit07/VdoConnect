"use client";
import { useSocket } from "@/app/hooks/useSocket";
import { useState, useEffect, useRef } from "react";

export default function HomePage() {
    const { socket, isConnected } = useSocket();
    const [email, setEmail] = useState("");
    const [username, setUsername] = useState(""); // New state for username
    const [roomName, setRoomName] = useState("");
    const [roomPassword, setRoomPassword] = useState(""); // New state for room password
    const [messages, setMessages] = useState([]);
    const [currentRoom, setCurrentRoom] = useState(null);
    const [roomUsers, setRoomUsers] = useState([]); // Now stores {email, username} objects
    const [isCreator, setIsCreator] = useState(false);
    const [creatorUsername, setCreatorUsername] = useState(""); // Changed from creatorEmail
    const messagesEndRef = useRef(null);

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

        const savedMessages = localStorage.getItem("videoChatMessages");
        if (savedMessages) setMessages(JSON.parse(savedMessages));

        const savedRoomUsers = localStorage.getItem("videoChatRoomUsers");
        if (savedRoomUsers) setRoomUsers(JSON.parse(savedRoomUsers));
    }, []);

    useEffect(() => {
        localStorage.setItem("videoChatEmail", email);
        localStorage.setItem("videoChatUsername", username);
        localStorage.setItem("videoChatCurrentRoom", currentRoom || "");
        localStorage.setItem("videoChatIsCreator", isCreator.toString());
        localStorage.setItem("videoChatCreatorUsername", creatorUsername);
        localStorage.setItem("videoChatMessages", JSON.stringify(messages));
        localStorage.setItem("videoChatRoomUsers", JSON.stringify(roomUsers));
    }, [email, username, currentRoom, isCreator, creatorUsername, messages, roomUsers]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        if (!socket) return;

        const handleCreated = (data) => {
            setCurrentRoom(data.roomName);
            setIsCreator(true);
            setCreatorUsername(username); // Creator is yourself
            setRoomUsers([{ email, username }]);
            addMessage(`You created room ${data.roomName}`, "system");
        };

        const handleJoined = (data) => {
            setCurrentRoom(data.roomName);
            if (data.creatorUsername) {
                setCreatorUsername(data.creatorUsername);
            }
            setRoomUsers(data.users.map(u => ({ email: u.email, username: u.username })));
            addMessage(
                `You joined room ${data.roomName} (Created by ${data.creatorUsername || "unknown"})`,
                "system"
            );
        };

        const handleUserJoined = (data) => {
            setRoomUsers(prev => {
                const exists = prev.some(u => u.email === data.email);
                return exists ? prev : [...prev, { email: data.email, username: data.username }];
            });

            if (data.email === email) return; // Don't show message for yourself
            addMessage(`${data.username} joined the room`, "info");
        };

        const handleUserLeft = (data) => {
            const { username: leftUsername, roomName } = data;

            setRoomUsers(prev => prev.filter(user => user.username !== leftUsername));

            if (leftUsername === username) {
                // Current user left
                addMessage(`You left room ${roomName}`, "system");
                setCurrentRoom(null);
                setIsCreator(false);
                setCreatorUsername("");
            } else {
                // Someone else left
                addMessage(`${leftUsername} left the room`, "info");

                if (leftUsername === creatorUsername) {
                    setCreatorUsername("");
                    addMessage(`Room creator has left`, "system-error");
                }
            }
        };

        const handleKicked = (data) => {
            addMessage(`You were kicked from room ${data.roomName} by ${data.by}`, "system-error");
            setCurrentRoom(null);
            setIsCreator(false);
            setCreatorUsername("");
            setRoomUsers([]);
        };

        const handleFull = (data) => {
            addMessage(`Room ${data.roomName} is full`, "system-error");
        };

        const handleError = (data) => {
            addMessage(`Error: ${data.message}`, "system-error");
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

    const addMessage = (text, type = "info") => {
        const newMessage = {
            text,
            type,
            timestamp: Date.now()
        };
        setMessages(prev => [...prev, newMessage]);
    };

    const handleJoinRoom = () => {
        if (socket && isConnected && email && username) {
            const room = roomName || "default-room";
            const password = roomPassword || ""; // Default empty password

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
            addMessage(`You left room ${currentRoom}`, "system");
        }
    };

    const handleKickUser = (targetEmail) => {
        if (socket && currentRoom && isCreator && targetEmail !== email) {
            socket.emit("kick-user", {
                roomName: currentRoom,
                targetEmail
            });

            // Immediately remove the user from local state
            setRoomUsers(prev => prev.filter(user => user.email !== targetEmail));
            const targetUser = roomUsers.find(u => u.email === targetEmail);
            addMessage(`You kicked ${targetUser?.username || targetEmail} from the room`, "system");
        }
    };

    const clearLocalStorage = () => {
        localStorage.removeItem("videoChatEmail");
        localStorage.removeItem("videoChatUsername");
        localStorage.removeItem("videoChatCurrentRoom");
        localStorage.removeItem("videoChatIsCreator");
        localStorage.removeItem("videoChatCreatorUsername");
        localStorage.removeItem("videoChatMessages");
        localStorage.removeItem("videoChatRoomUsers");
        setMessages([]);
    };

    return (
        <div className="p-4 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-4">Video Call App</h1>

            {!currentRoom ? (
                <div className="mb-4 p-4 border rounded">
                    <div className="mb-3">
                        <label className="block mb-1 font-medium">Your Email</label>
                        <input
                            type="email"
                            placeholder="Enter your email..."
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full border p-2 rounded"
                            required
                        />
                    </div>
                    <div className="mb-3">
                        <label className="block mb-1 font-medium">Your Username</label>
                        <input
                            type="text"
                            placeholder="Enter your username..."
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full border p-2 rounded"
                            required
                        />
                    </div>
                    <div className="mb-3">
                        <label className="block mb-1 font-medium">Room Name</label>
                        <input
                            type="text"
                            placeholder="Enter room name (leave blank for default)"
                            value={roomName}
                            onChange={(e) => setRoomName(e.target.value)}
                            className="w-full border p-2 rounded"
                        />
                    </div>
                    <div className="mb-3">
                        <label className="block mb-1 font-medium">Room Password</label>
                        <input
                            type="password"
                            placeholder="Enter password (required for existing rooms)"
                            value={roomPassword}
                            onChange={(e) => setRoomPassword(e.target.value)}
                            className="w-full border p-2 rounded"
                        />
                    </div>
                    <button
                        onClick={handleJoinRoom}
                        className="bg-blue-500 hover:bg-blue-600 cursor-pointer text-white p-2 rounded w-full"
                        disabled={!isConnected || !email || !username}
                    >
                        {isConnected ? "Join Room" : "Connecting..."}
                    </button>
                </div>
            ) : (
                <div className="mb-4 p-4 border rounded">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <span className="font-semibold">Room: {currentRoom}</span>
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
                        </div>
                        <button
                            onClick={handleLeaveRoom}
                            className="bg-red-500 hover:bg-red-600 cursor-pointer text-white p-2 rounded"
                        >
                            Leave Room
                        </button>
                    </div>

                    <div className="mb-4">
                        <h3 className="font-semibold mb-2">Users in Room ({roomUsers.length}):</h3>
                        <ul className="border rounded divide-y">
                            {roomUsers.map((user, index) => (
                                <li key={index} className="flex justify-between items-center p-2">
                                    <span className={user.email === email ? "font-medium" : ""}>
                                        {user.username}
                                        {user.email === email && " (You)"}
                                        {user.username === creatorUsername && " (Creator)"}
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
                </div>
            )}

            <div className="mb-2 flex justify-between items-center">
                <span className={`inline-block px-2 py-1 rounded text-sm ${isConnected ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                    }`}>
                    {isConnected ? "Connected to server" : "Disconnected"}
                </span>
                <button
                    onClick={clearLocalStorage}
                    className="text-sm text-gray-500 hover:text-gray-700"
                    title="Clear all saved data"
                >
                    Clear Data
                </button>
            </div>

            <div className="border rounded p-4 h-64 overflow-y-auto">
                <h2 className="text-xl font-bold mb-2">Room Activity:</h2>
                <ul className="space-y-2">
                    {messages.map((msg, index) => (
                        <li
                            key={index}
                            className={`text-sm p-2 rounded ${msg.type === "system-error"
                                ? "bg-red-100 text-red-800"
                                : msg.type === "system"
                                    ? "bg-blue-100 text-blue-800"
                                    : "bg-gray-100"
                                }`}
                        >
                            <div className="flex justify-between">
                                <span className=" text-black">{msg.text}</span>
                                <span className="text-xs text-gray-500">
                                    {new Date(msg.timestamp).toLocaleTimeString()}
                                </span>
                            </div>
                        </li>
                    ))}
                    <div ref={messagesEndRef} />
                </ul>
            </div>
        </div>
    );
}