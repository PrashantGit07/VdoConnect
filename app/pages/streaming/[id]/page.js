"use client";
import { useSocket } from "@/app/hooks/useSocket";
import { useState, useEffect, useRef, useCallback } from "react";
import toast from "react-hot-toast";
import { useParams, useRouter } from "next/navigation";
import {
    FaMicrophone,
    FaMicrophoneSlash,
    FaVideo,
    FaVideoSlash,
    FaPlay,
    FaPause,
    FaStop
} from "react-icons/fa";

export default function StreamingPage() {
    const { id: roomId } = useParams();
    const router = useRouter();
    const { socket, isConnected } = useSocket();
    const [email, setEmail] = useState("");
    const [username, setUsername] = useState("");
    const [currentRoom, setCurrentRoom] = useState(null);
    const [roomUsers, setRoomUsers] = useState([]);
    const [isCreator, setIsCreator] = useState(false);
    const [creatorUsername, setCreatorUsername] = useState("");
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [isStreamPaused, setIsStreamPaused] = useState(false);

    const videoRef = useRef(null);
    const remoteVideoRefs = useRef({});
    const streamRef = useRef(null);
    const [stream, setStream] = useState(null);
    const [peers, setPeers] = useState({});
    const peerConnections = useRef({});

    // Initialize media streams
    const initializeMediaStreams = useCallback(async () => {
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true, video: true });

            const mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: true
            });

            streamRef.current = mediaStream;
            setStream(mediaStream);

            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }

            mediaStream.getVideoTracks().forEach(track => {
                track.enabled = !isMuted
            });

            mediaStream.getAudioTracks().forEach(track => {
                track.enabled = !isCameraOff
            });

            return mediaStream;
        } catch (error) {
            console.error("Error initializing media streams:", error);
            if (error.name === 'NotAllowedError') {
                toast.error("Please allow camera and microphone access", { duration: 3000 });
            } else {
                toast.error("Failed to access camera/microphone", { duration: 3000 });
            }
            return null;
        }
    }, [isMuted, isCameraOff]);

    // Create Peer Connection
    const createPeerConnection = (socketId) => {
        const peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: ["stun:stun.l.google.com:19302"] }
            ]
        });

        if (stream) {
            stream.getTracks().forEach((track) => {
                peerConnection.addTrack(track, stream);
            });
        }

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("ice-candidate", event.candidate, currentRoom, socketId);
            }
        };

        peerConnection.ontrack = (event) => {
            setPeers((prevPeers) => ({
                ...prevPeers,
                [socketId]: event.streams[0]
            }));
        };

        peerConnections.current[socketId] = peerConnection;
        return peerConnection;
    };

    // Start streaming
    const handleStartStreaming = async () => {
        if (!isCreator || !currentRoom) {
            toast.error("Only room creator can start streaming", { duration: 3000 });
            return;
        }

        try {
            const mediaStream = await initializeMediaStreams();
            if (!mediaStream) return;

            setIsStreaming(true);
            socket.emit("ready", currentRoom);
            toast.success("Streaming started", { duration: 3000 });
        } catch (error) {
            console.error("Error starting streaming:", error);
            toast.error("Failed to start streaming", { duration: 3000 });
        }
    };

    // Pause/Resume streaming
    const handlePauseResumeStream = () => {
        if (!stream || !isCreator) return;

        const videoTracks = stream.getVideoTracks();
        const audioTracks = stream.getAudioTracks();

        if (isStreamPaused) {
            videoTracks.forEach(track => track.enabled = !isCameraOff);
            audioTracks.forEach(track => track.enabled = !isMuted);
            setIsStreamPaused(false);
            toast.success("Stream resumed", { duration: 2000 });
        } else {
            videoTracks.forEach(track => track.enabled = false);
            audioTracks.forEach(track => track.enabled = false);
            setIsStreamPaused(true);
            toast.success("Stream paused", { duration: 2000 });
        }
    };

    // Stop streaming
    const handleStopStreaming = () => {
        if (!stream || !isCreator) return;

        stream.getTracks().forEach(track => track.stop());
        setStream(null);
        setIsStreaming(false);
        setIsStreamPaused(false);

        Object.values(peerConnections.current).forEach(pc => pc.close());
        peerConnections.current = {};
        setPeers({});

        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }

        toast.success("Streaming stopped", { duration: 3000 });
    };

    // Toggle mute
    const handleToggleMute = () => {
        if (!stream) {
            toast.error("No media stream available", { duration: 3000 });
            return;
        }

        const audioTracks = stream.getAudioTracks();
        const newMutedState = !isMuted;

        audioTracks.forEach((track) => {
            track.enabled = !newMutedState;
        });

        setIsMuted(newMutedState);
        toast.success(newMutedState ? "Microphone muted" : "Microphone unmuted", { duration: 2000 });
    };

    // Toggle camera
    const handleToggleCamera = () => {
        if (!stream) {
            toast.error("No media stream available", { duration: 3000 });
            return;
        }

        const videoTracks = stream.getVideoTracks();
        const newCameraOffState = !isCameraOff;

        videoTracks.forEach((track) => {
            track.enabled = !newCameraOffState;
        });

        setIsCameraOff(newCameraOffState);
        toast.success(newCameraOffState ? "Camera turned off" : "Camera turned on", { duration: 2000 });
    };

    // WebRTC signaling effects
    useEffect(() => {
        if (!socket || !currentRoom) return;

        const handleReady = async ({ socketId, email: peerEmail }) => {
            if (peerEmail === socket.data?.email) return;

            const peerConnection = createPeerConnection(socketId);

            try {
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                socket.emit("offer", offer, currentRoom, socketId);
            } catch (error) {
                console.error("Error creating offer:", error);
                toast.error("Failed to create peer connection", { duration: 3000 });
            }
        };

        const handleOffer = async ({ offer, sender }) => {
            if (!stream) return;

            const peerConnection = createPeerConnection(sender);

            try {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                socket.emit("answer", answer, currentRoom, sender);
            } catch (error) {
                console.error("Error handling offer:", error);
                toast.error("Failed to handle offer", { duration: 3000 });
            }
        };

        const handleAnswer = async ({ answer, sender }) => {
            const peerConnection = peerConnections.current[sender];
            if (!peerConnection) return;

            try {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            } catch (error) {
                console.error("Error setting remote description:", error);
                toast.error("Failed to set remote description", { duration: 3000 });
            }
        };

        const handleIceCandidate = async ({ candidate, sender }) => {
            const peerConnection = peerConnections.current[sender];
            if (!peerConnection) return;

            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
                console.error("Error handling ICE candidate:", error);
            }
        };

        socket.on("ready", handleReady);
        socket.on("offer", handleOffer);
        socket.on("answer", handleAnswer);
        socket.on("ice-candidate", handleIceCandidate);

        return () => {
            socket.off("ready", handleReady);
            socket.off("offer", handleOffer);
            socket.off("answer", handleAnswer);
            socket.off("ice-candidate", handleIceCandidate);
        };
    }, [socket, currentRoom, stream]);

    // Cleanup peer connections and media streams
    useEffect(() => {
        return () => {
            Object.values(peerConnections.current).forEach((peerConnection) => {
                peerConnection.close();
            });
            peerConnections.current = {};

            if (stream) {
                stream.getTracks().forEach((track) => track.stop());
                setStream(null);
            }
        };
    }, []);

    // Fetch room details and user info
    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch user details
                const userResponse = await fetch('/api/user/me', {
                    method: 'GET',
                    credentials: 'include',
                });

                if (!userResponse.ok) {
                    throw new Error("Failed to fetch user details");
                }

                const userData = await userResponse.json();
                setEmail(userData.user.email);
                setUsername(userData.user.username);
                setIsAuthenticated(true);

                // Fetch room details
                const roomResponse = await fetch(`/api/get-room-details/${roomId}`);
                if (!roomResponse.ok) {
                    throw new Error("Failed to fetch room details");
                }

                const roomData = await roomResponse.json();
                setCurrentRoom(roomData.room.roomName);

                // Set creator status and info
                const isCreator = roomData.room.createdBy.email === userData.user.email;
                setIsCreator(isCreator);
                setCreatorUsername(roomData.room.createdBy.username);

                // Set room users
                const users = roomData.room.joinees.map(joinee => ({
                    email: joinee.email,
                    username: joinee.username
                }));
                setRoomUsers(users);

            } catch (error) {
                console.error("Error fetching data:", error);
                toast.error(error.message || "Failed to load room data", { duration: 3000 });
                router.push('/video-chat');
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [roomId, router]);

    // Socket event handlers for real-time updates
    useEffect(() => {
        if (!socket || !isAuthenticated) return;

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
                router.push('/video-chat');
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
            router.push('/video-chat');
        };

        socket.on("user-joined", handleUserJoined);
        socket.on("user-left", handleUserLeft);
        socket.on("user-disconnected", handleUserLeft);
        socket.on("kicked", handleKicked);

        return () => {
            socket.off("user-joined", handleUserJoined);
            socket.off("user-left", handleUserLeft);
            socket.off("user-disconnected", handleUserLeft);
            socket.off("kicked", handleKicked);
        };
    }, [socket, email, username, creatorUsername, isAuthenticated, router]);

    const handleLeaveRoom = () => {
        if (socket && currentRoom) {
            socket.emit("leaveRoom", currentRoom);
            handleStopStreaming();
            router.push('/video-chat');
        }
    };

    const handleKickUser = (targetEmail) => {
        if (socket && currentRoom && isCreator && targetEmail !== email) {
            socket.emit("kick-user", {
                roomName: currentRoom,
                targetEmail
            });
        }
    };

    const getVideoAreaMessage = () => {
        if (isCreator) {
            return isStreaming ? "Your stream" : "Click 'Start Streaming' to begin";
        }

        if (!creatorUsername) {
            return "The organizer has left the room";
        }

        return `Waiting for ${creatorUsername}'s stream`;
    };

    if (isLoading) {
        return (
            <div className="p-4 max-w-6xl mx-auto text-white flex justify-center items-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-white mx-auto"></div>
                    <p className="mt-4 text-xl">Loading room data...</p>
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
                        onClick={handleLeaveRoom}
                        className="bg-red-500 hover:bg-red-600 cursor-pointer text-white px-3 py-1 rounded text-sm"
                    >
                        Leave Room
                    </button>
                </div>
            </div>

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

                    <div className="w-3/4 p-4 bg-gray-700 h-[calc(100vh-200px)] flex flex-col">
                        <div className="flex-1 bg-black rounded-lg overflow-hidden relative">
                            <div className="w-full h-full relative">
                                {Object.entries(peers).length > 0 ? (
                                    Object.entries(peers).map(([socketId, peerStream]) => (
                                        <video
                                            key={socketId}
                                            autoPlay
                                            playsInline
                                            className="w-full h-full object-cover"
                                            ref={(video) => {
                                                if (video && peerStream) {
                                                    video.srcObject = peerStream;
                                                    remoteVideoRefs.current[socketId] = video;
                                                }
                                            }}
                                        />
                                    ))
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <p className="text-white text-xl text-center">
                                            {getVideoAreaMessage()}
                                        </p>
                                    </div>
                                )}

                                {stream && isStreaming && (
                                    <div className="absolute bottom-4 right-4 w-48 h-36 rounded-lg border-2 border-white overflow-hidden bg-black">
                                        <video
                                            ref={videoRef}
                                            autoPlay
                                            muted
                                            playsInline
                                            className={`w-full h-full object-cover ${isCameraOff ? 'hidden' : 'block'}`}
                                        />
                                        {isCameraOff && (
                                            <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                                <FaVideoSlash className="text-white text-2xl" />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {isCreator && isStreaming && (
                                    <div className="absolute top-4 right-4 flex space-x-2">
                                        <button
                                            onClick={handlePauseResumeStream}
                                            className={`${isStreamPaused ? 'bg-green-500 hover:bg-green-600' : 'bg-yellow-500 hover:bg-yellow-600'} text-white p-2 rounded-full`}
                                            title={isStreamPaused ? 'Resume Stream' : 'Pause Stream'}
                                        >
                                            {isStreamPaused ? <FaPlay /> : <FaPause />}
                                        </button>
                                        <button
                                            onClick={handleStopStreaming}
                                            className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-full"
                                            title="Stop Stream"
                                        >
                                            <FaStop />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-4 flex justify-center space-x-4">
                            {isStreaming && (
                                <>
                                    <button
                                        onClick={handleToggleMute}
                                        className={`${isMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'} text-white p-3 rounded-full`}
                                        title={isMuted ? 'Unmute' : 'Mute'}
                                    >
                                        {isMuted ? <FaMicrophoneSlash /> : <FaMicrophone />}
                                    </button>
                                    <button
                                        onClick={handleToggleCamera}
                                        className={`${isCameraOff ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'} text-white p-3 rounded-full`}
                                        title={isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
                                    >
                                        {isCameraOff ? <FaVideoSlash /> : <FaVideo />}
                                    </button>
                                </>
                            )}

                            {isCreator && !isStreaming && (
                                <button
                                    onClick={handleStartStreaming}
                                    className="bg-green-500 hover:bg-green-600 text-white p-2 px-4 rounded"
                                >
                                    Start Streaming
                                </button>
                            )}

                            <button
                                onClick={handleLeaveRoom}
                                className="bg-red-500 hover:bg-red-600 text-white p-2 px-4 rounded"
                            >
                                Leave Meeting
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-2">
                <span className={`inline-block px-2 py-1 rounded text-sm ${isConnected ? "bg-green-700 text-green-200" : "bg-red-700 text-red-200"}`}>
                    {isConnected ? "Connected to server" : "Disconnected"}
                </span>
            </div>
        </div>
    );
}