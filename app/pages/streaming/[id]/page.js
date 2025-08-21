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
    FaStop,
    FaDesktop,
    FaComments,
    FaHandPaper,
    FaTimes,
    FaUsers,
    FaExpand,
    FaCompress
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
    const [overlayMessage, setOverlayMessage] = useState("");
    const [isScreenSharing, setisScreenSharing] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
    const [isHandRaised, setIsHandRaised] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const mainVideoRef = useRef(null);
    const previewVideoRef = useRef(null);
    const remoteVideoRefs = useRef({});
    const streamRef = useRef(null);
    const [stream, setStream] = useState(null);
    const [peers, setPeers] = useState({});
    const [remoteStreams, setRemoteStreams] = useState({});
    const peerConnections = useRef({});
    const screenStreamRef = useRef(null);

    // Show overlay message
    const showOverlayMessage = (message) => {
        setOverlayMessage(message);
        setTimeout(() => setOverlayMessage(""), 2000);
    };

    // Initialize media streams
    const initializeMediaStreams = useCallback(async () => {
        try {
            console.log("Getting user media permissions");
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: true
            });
            console.log("Got media stream successfully");

            streamRef.current = mediaStream;
            setStream(mediaStream);

            // Set to main video for creator
            if (mainVideoRef.current && isCreator) {
                mainVideoRef.current.srcObject = mediaStream;

                // Wait for metadata to load before playing
                const playVideo = () => {
                    const playPromise = mainVideoRef.current.play();

                    if (playPromise !== undefined) {
                        playPromise
                            .then(() => console.log("Video playback started"))
                            .catch(err => {
                                console.error("Video play failed, retrying...", err);
                                // Retry after a short delay
                                setTimeout(playVideo, 500);
                            });
                    }
                };

                // Start playback attempt
                if (mainVideoRef.current.readyState >= HTMLMediaElement.HAVE_METADATA) {
                    playVideo();
                } else {
                    mainVideoRef.current.onloadedmetadata = playVideo;
                }
            }

            // Set to preview video
            if (previewVideoRef.current) {
                previewVideoRef.current.srcObject = mediaStream;
                previewVideoRef.current.play()
                    .then(() => console.log("Preview playback started"))
                    .catch(err => console.error("Preview video play failed", err));
            }

            mediaStream.getVideoTracks().forEach(track => {
                track.enabled = !isCameraOff;
            });

            mediaStream.getAudioTracks().forEach(track => {
                track.enabled = !isMuted;
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
    }, [isMuted, isCameraOff, isCreator]);

    // Create Peer Connection
    const createPeerConnection = (socketId) => {
        const peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: ["stun:stun.l.google.com:19302"] }
            ]
        });

        //add our stream track if we have a stream
        if (streamRef.current && isCreator) {
            streamRef.current.getTracks().forEach((track) => {
                peerConnection.addTrack(track, streamRef.current)
            })
        } else {
            peerConnection.addTransceiver("video", { direction: "recvonly" });
            peerConnection.addTransceiver("audio", { direction: "recvonly" });
        }

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("ice-candidate", event.candidate, currentRoom, socketId);
            }
        };

        peerConnection.ontrack = (event) => {
            console.log("Received remote stream from:", socketId);
            const remoteStream = event.streams[0] ?? new MediaStream([event.track]);

            setRemoteStreams(prev => ({
                ...prev,
                [socketId]: remoteStream
            }));

            // For joinees, always update the main video with the first received stream
            if (!isCreator && mainVideoRef.current) {
                mainVideoRef.current.srcObject = remoteStream
                const p = mainVideoRef.current.play();
                if (p) p.catch(err => console.warn("autoplay rejected; user gesture needed", err));
            }
        };

        peerConnection.onconnectionstatechange = () => {
            console.log("peer connection state", peerConnection.connectionState);
        }

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

    const getVideoAreaMessage = () => {
        if (isCreator) {
            return isStreaming ? "Your stream" : "Click 'Start Streaming' to begin";
        }

        if (!creatorUsername) {
            return "The organizer has left the room";
        }

        return `Waiting for ${creatorUsername}'s stream`;
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
            showOverlayMessage("Stream resumed");
            toast.success("Stream resumed", { duration: 2000 });
        } else {
            videoTracks.forEach(track => track.enabled = false);
            audioTracks.forEach(track => track.enabled = false);
            setIsStreamPaused(true);
            showOverlayMessage("Stream paused");
            toast.success("Stream paused", { duration: 2000 });
        }
    };

    // Stop streaming
    const handleStopStreaming = () => {
        if (!stream || !isCreator) return;

        if (isScreenSharing) {
            stopScreenShare();
        }

        stream.getTracks().forEach(track => track.stop());
        setStream(null);
        setIsStreaming(false);
        setIsStreamPaused(false);

        Object.values(peerConnections.current).forEach(pc => pc.close());
        peerConnections.current = {};
        setPeers({});
        setRemoteStreams({});

        if (mainVideoRef.current) {
            mainVideoRef.current.srcObject = null;
        }
        if (previewVideoRef.current) {
            previewVideoRef.current.srcObject = null;
        }

        socket.emit("stream-stopped", currentRoom);
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
        showOverlayMessage(newMutedState ? "Microphone muted" : "Microphone unmuted");
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
        showOverlayMessage(newCameraOffState ? "Camera turned off" : "Camera turned on");
        toast.success(newCameraOffState ? "Camera turned off" : "Camera turned on", { duration: 2000 });
    };

    // WebRTC signaling effects
    useEffect(() => {
        if (!socket || !currentRoom) return;

        const handleReady = async ({ socketId, email: peerEmail, username: peerUsername }) => {
            if (isCreator) return
            if (!socketId || peerEmail === email) return;

            console.log("Creating peer connection for:", socketId, peerEmail);
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
            if (!isCreator) return; // creator should not handle offers, only joinees respond

            console.log("Received offer from:", sender);
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
                if (candidate) {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                }
            } catch (error) {
                console.error("Error handling ICE candidate:", error);
            }
        };

        const handleStreamStopped = () => {
            // Clear remote streams when creator stops streaming
            setRemoteStreams({});
            if (!isCreator && mainVideoRef.current) {
                mainVideoRef.current.srcObject = null;
            }
        };

        socket.on("ready", handleReady);
        socket.on("offer", handleOffer);
        socket.on("answer", handleAnswer);
        socket.on("ice-candidate", handleIceCandidate);
        socket.on("stream-stopped", handleStreamStopped);

        return () => {
            socket.off("ready", handleReady);
            socket.off("offer", handleOffer);
            socket.off("answer", handleAnswer);
            socket.off("ice-candidate", handleIceCandidate);
            socket.off("stream-stopped", handleStreamStopped);
        };
    }, [socket, currentRoom, stream, isCreator]);

    // Update video display when stream changes
    useEffect(() => {
        if (stream && isCreator && mainVideoRef.current) {
            mainVideoRef.current.srcObject = stream;
            mainVideoRef.current.play().catch(err => console.error("Video play failed", err));
        }
    }, [stream, isCreator]);

    // Update preview video when stream changes
    useEffect(() => {
        if (stream && previewVideoRef.current) {
            previewVideoRef.current.srcObject = stream;
            previewVideoRef.current.play().catch(err => console.error("Preview video play failed", err));
        }
    }, [stream]);

    // Cleanup peer connections and media streams
    useEffect(() => {
        return () => {
            Object.values(peerConnections.current).forEach((peerConnection) => {
                peerConnection.close();
            });
            peerConnections.current = {};

            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop());
                streamRef.current = null
            }

            if (screenStreamRef.current) {
                screenStreamRef.current.getTracks().forEach((track) => track.stop());
                screenStreamRef.current = null
            }

            if (isStreaming && socket && currentRoom) {
                socket.emit("stream-stopped", currentRoom);
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
                router.push('/page/connect-room');
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
                router.push('/pages/connect-room');
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
            router.push('/pages/connect-room');
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
            router.push('/pages/connect-room');
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

    const handleToggleScreenShare = async () => {
        console.log("function called for screen sharing");
        if (!isStreaming) {
            console.log("streaming nahi chaalu hai");
            alert("you are not streaming")
            return;
        }
        try {
            if (isScreenSharing) {
                stopScreenShare();
            } else {
                //start screen sharing
                const screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: false
                })

                //handle if user cancels screen share  
                screenStream.getVideoTracks()[0].onended = stopScreenShare;

                screenStreamRef.current = screenStream
                setisScreenSharing(true)

                //replacing tracks in all peer connections
                replaceTrackInAllPeers(screenStream)

                //udpate the local video display
                if (mainVideoRef.current && isCreator) {
                    mainVideoRef.current.srcObject = screenStream
                }

                toast.success("screen share started")
            }
        }
        catch (e) {
            console.log("error in sharing screen", e);
        }
    }

    const stopScreenShare = async () => {
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(track => track.stop())
            screenStreamRef.current = null
        }

        setisScreenSharing(false)

        //revert to camera in all peers
        if (streamRef.current) {
            replaceTrackInAllPeers(streamRef.current)
        }

        //revert to local video display to camera
        if (mainVideoRef.current && isCreator && streamRef.current) {
            mainVideoRef.current.srcObject = streamRef.current
        }
        toast.success("screen sharing stopped")
    }

    const replaceTrackInAllPeers = async (newStream) => {
        Object.entries(peerConnections.current).forEach(([socketId, pc]) => {
            const senders = pc.getSenders();

            // Replace video track
            const videoSender = senders.find(sender =>
                sender.track && sender.track.kind === 'video'
            );
            if (videoSender && newStream.getVideoTracks().length > 0) {
                videoSender.replaceTrack(newStream.getVideoTracks()[0])
                    .catch(error => console.error("Error replacing video track:", error));
            }
        })
    }

    const handleToggleChat = () => {
        setIsChatOpen(!isChatOpen);
    };

    const handleToggleParticipants = () => {
        setIsParticipantsOpen(!isParticipantsOpen);
    };

    const handleToggleHandRaise = () => {
        setIsHandRaised(!isHandRaised);
        showOverlayMessage(isHandRaised ? "Hand lowered" : "Hand raised");
        toast.success(isHandRaised ? "Hand lowered" : "Hand raised", { duration: 2000 });
    };

    const handleToggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-900 flex justify-center items-center">
                <div className="text-center text-white">
                    <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="mt-4 text-xl">Loading room data...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-900 text-white relative overflow-hidden">
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 z-30 bg-gray-800/90 backdrop-blur-sm border-b border-gray-700">
                <div className="flex justify-between items-center px-4 py-3">
                    <div className="flex items-center space-x-4">
                        <h1 className="text-lg font-semibold">Video Call App</h1>
                        <div className="flex items-center space-x-2 text-sm">
                            <span className="text-gray-300">Room:</span>
                            <span className="font-medium">{currentRoom}</span>
                            {isCreator && (
                                <span className="bg-green-600/20 text-green-400 px-2 py-1 rounded text-xs">
                                    Creator
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center space-x-3">
                        <span className="text-sm text-gray-300">Welcome, {username}!</span>
                        <span className={`text-xs px-2 py-1 rounded ${isConnected ? "bg-green-600/20 text-green-400" : "bg-red-600/20 text-red-400"}`}>
                            {isConnected ? "Connected" : "Disconnected"}
                        </span>
                    </div>
                </div>
            </div>

            {/* Main Video Area */}
            <div className="absolute inset-0 pt-16 pb-20">
                <div className="w-full h-full bg-black relative">
                    {/* Overlay Message */}
                    {overlayMessage && (
                        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 bg-black/80 text-white px-6 py-3 rounded-lg text-lg font-medium">
                            {overlayMessage}
                        </div>
                    )}

                    <video
                        ref={mainVideoRef}
                        autoPlay
                        playsInline
                        muted={isCreator}
                        className={`w-full h-full object-contain ${(isCreator && !stream) || (!isCreator && !Object.values(remoteStreams).length)
                            ? 'hidden'
                            : 'block'
                            }`}
                    />

                    {/* Show message when no stream available */}
                    {((isCreator && !isStreaming) || (!isCreator && !Object.keys(remoteStreams).length)) && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black">
                            <div className="text-center">
                                <div className="text-6xl text-gray-600 mb-4">📹</div>
                                <p className="text-white text-2xl mb-4">
                                    {isCreator
                                        ? "Click 'Start Streaming' to begin"
                                        : creatorUsername
                                            ? `Waiting for ${creatorUsername}'s stream`
                                            : "The organizer has left the room"}
                                </p>
                                {isCreator && !isStreaming && (
                                    <button
                                        onClick={handleStartStreaming}
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg text-lg font-semibold transition-colors"
                                    >
                                        Start Streaming
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Preview video for creator */}
                    {stream && isCreator && isStreaming && (
                        <div className="absolute bottom-4 right-4 w-64 h-48 rounded-lg border-2 border-white/20 overflow-hidden bg-black shadow-2xl">
                            <video
                                ref={previewVideoRef}
                                autoPlay
                                muted
                                playsInline
                                className={`w-full h-full object-cover ${isCameraOff ? 'hidden' : 'block'}`}
                            />
                            {isCameraOff && (
                                <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                    <FaVideoSlash className="text-white text-3xl" />
                                </div>
                            )}
                            <div className="absolute bottom-2 left-2 bg-black/60 text-white px-2 py-1 rounded text-sm">
                                You
                            </div>
                        </div>
                    )}

                    {/* Stream paused overlay */}
                    {isStreamPaused && isCreator && (
                        <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                            <div className="text-white text-3xl font-bold">
                                Stream Paused
                            </div>
                        </div>
                    )}

                    {/* Hand raise indicator */}
                    {isHandRaised && (
                        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-yellow-500/90 text-black px-4 py-2 rounded-full flex items-center space-x-2">
                            <FaHandPaper />
                            <span>Hand Raised</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Control Bar */}
            <div className="absolute bottom-0 left-0 right-0 z-30 bg-gray-800/95 backdrop-blur-sm border-t border-gray-700">
                <div className="flex justify-center items-center py-4 px-6">
                    <div className="flex items-center space-x-4">
                        {/* Media Controls */}
                        {isStreaming && (
                            <>
                                <button
                                    onClick={handleToggleMute}
                                    className={`${isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-600 hover:bg-gray-700'} text-white p-4 rounded-full transition-colors`}
                                    title={isMuted ? 'Unmute' : 'Mute'}
                                >
                                    {isMuted ? <FaMicrophoneSlash size={20} /> : <FaMicrophone size={20} />}
                                </button>
                                <button
                                    onClick={handleToggleCamera}
                                    className={`${isCameraOff ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-600 hover:bg-gray-700'} text-white p-4 rounded-full transition-colors`}
                                    title={isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
                                >
                                    {isCameraOff ? <FaVideoSlash size={20} /> : <FaVideo size={20} />}
                                </button>
                                {isCreator && (
                                    <>
                                        <button
                                            onClick={handlePauseResumeStream}
                                            className={`${isStreamPaused ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-orange-600 hover:bg-orange-700'} text-white p-4 rounded-full transition-colors`}
                                            title={isStreamPaused ? 'Resume Stream' : 'Pause Stream'}
                                        >
                                            {isStreamPaused ? <FaPlay size={20} /> : <FaPause size={20} />}
                                        </button>
                                        <button
                                            onClick={handleStopStreaming}
                                            className="bg-red-600 hover:bg-red-700 text-white p-4 rounded-full transition-colors"
                                            title="Stop Stream"
                                        >
                                            <FaStop size={20} />
                                        </button>
                                    </>
                                )}
                            </>
                        )}

                        {/* Start Streaming Button */}
                        {isCreator && !isStreaming && (
                            <button
                                onClick={handleStartStreaming}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                            >
                                Start Streaming
                            </button>
                        )}

                        {/* Screen Share */}
                        <button
                            onClick={handleToggleScreenShare}
                            disabled={!isStreaming}
                            className={`${isScreenSharing ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-600 hover:bg-gray-700'} ${!isStreaming ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} text-white p-4 rounded-full transition-colors`}
                            title={isStreaming ? (isScreenSharing ? 'Stop Screen Share' : 'Share Screen') : 'Start streaming to share screen'}
                        >
                            <FaDesktop size={20} />
                        </button>

                        {/* Hand Raise */}
                        <button
                            onClick={handleToggleHandRaise}
                            className={`${isHandRaised ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-gray-600 hover:bg-gray-700'} text-white p-4 rounded-full transition-colors`}
                            title={isHandRaised ? 'Lower Hand' : 'Raise Hand'}
                        >
                            <FaHandPaper size={20} />
                        </button>

                        {/* Chat */}
                        <button
                            onClick={handleToggleChat}
                            className={`${isChatOpen ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-600 hover:bg-gray-700'} text-white p-4 rounded-full transition-colors relative`}
                            title="Toggle Chat"
                        >
                            <FaComments size={20} />
                        </button>

                        {/* Participants */}
                        <button
                            onClick={handleToggleParticipants}
                            className={`${isParticipantsOpen ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-600 hover:bg-gray-700'} text-white p-4 rounded-full transition-colors relative`}
                            title="Toggle Participants"
                        >
                            <FaUsers size={20} />
                            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
                                {roomUsers.length}
                            </span>
                        </button>

                        {/* Fullscreen */}
                        <button
                            onClick={handleToggleFullscreen}
                            className="bg-gray-600 hover:bg-gray-700 text-white p-4 rounded-full transition-colors"
                            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                        >
                            {isFullscreen ? <FaCompress size={20} /> : <FaExpand size={20} />}
                        </button>

                        {/* Leave Room */}
                        <button
                            onClick={handleLeaveRoom}
                            className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                        >
                            Leave Meeting
                        </button>
                    </div>
                </div>
            </div>

            {/* Participants Panel */}
            {isParticipantsOpen && (
                <div className="absolute top-16 right-4 bottom-20 w-80 bg-gray-800/95 backdrop-blur-sm border border-gray-600 rounded-lg shadow-2xl z-40">
                    <div className="flex justify-between items-center p-4 border-b border-gray-600">
                        <h3 className="font-semibold text-lg">Participants ({roomUsers.length})</h3>
                        <button
                            onClick={handleToggleParticipants}
                            className="text-gray-400 hover:text-white p-1"
                        >
                            <FaTimes />
                        </button>
                    </div>
                    <div className="p-4 h-full overflow-y-auto">
                        <div className="space-y-3">
                            {roomUsers.map((user, index) => (
                                <div key={index} className="flex justify-between items-center p-3 rounded-lg bg-gray-700/50 hover:bg-gray-700">
                                    <div className="flex items-center space-x-3">
                                        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-sm font-medium">
                                            {user.username.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <span className={`${user.email === email ? "font-medium text-blue-300" : "text-white"}`}>
                                                {user.username}
                                                {user.email === email && " (You)"}
                                            </span>
                                            {user.username === creatorUsername && (
                                                <span className="ml-2">👑</span>
                                            )}
                                        </div>
                                    </div>
                                    {isCreator && user.email !== email && (
                                        <button
                                            onClick={() => handleKickUser(user.email)}
                                            className="text-sm bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white px-3 py-1 rounded transition-colors"
                                        >
                                            Kick
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Chat Panel */}
            {isChatOpen && (
                <div className="absolute top-16 right-4 bottom-20 w-80 bg-gray-800/95 backdrop-blur-sm border border-gray-600 rounded-lg shadow-2xl z-40">
                    <div className="flex justify-between items-center p-4 border-b border-gray-600">
                        <h3 className="font-semibold text-lg">Chat</h3>
                        <button
                            onClick={handleToggleChat}
                            className="text-gray-400 hover:text-white p-1"
                        >
                            <FaTimes />
                        </button>
                    </div>
                    <div className="p-4 h-full flex flex-col">
                        <div className="flex-1 overflow-y-auto mb-4">
                            {/* Chat messages would go here */}
                            <div className="text-center text-gray-400 py-8">
                                <FaComments size={48} className="mx-auto mb-4 opacity-50" />
                                <p>No messages yet</p>
                                <p className="text-sm mt-2">Start a conversation!</p>
                            </div>
                        </div>
                        <div className="flex space-x-2">
                            <input
                                type="text"
                                placeholder="Type a message..."
                                className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                            />
                            <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">
                                Send
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}