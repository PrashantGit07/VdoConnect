import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server } from 'socket.io';
import mongoose from 'mongoose';

// Import your models - adjust the path as needed
import { Room } from './app/config/Models/RoomModel.js';
import { UserModel } from './app/config/Models/UserModel.js';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// Socket.io variables
const emailToSocketMapping = new Map();
const roomCreators = new Map();
const roomUsers = new Map();
const roomMessages = new Map()
app.prepare().then(() => {  //this line boots nextjs internally  but doesn't start its own server
    const server = createServer((req, res) => {  //method from http 
        const parsedUrl = parse(req.url, true);
        handle(req, res, parsedUrl); //this line hand offs the server to nextJs pages/api router handles , this way the custom server is used by the netxjs as well to run its /pages /api
    });

    const io = new Server(server, { // inside the same server here we are creating our socket.io server on the same HTTP layer
        path: "/api/socket",

        cors: { //this is the main part why we created custom server
            //this is something which we can not set in nextjs
            //with custom server now we are controlling our own CORS rules
            origin: ["http://localhost:3000", "https://a2a76c3a106f.ngrok-free.app"],
            methods: ["GET", "POST"],
            credentials: true,
            allowedHeaders: ["Content-Type", "Authorization"]
        },
        allowEIO3: true,
        transports: ["websocket", "polling"]
    });

    io.on("connection", (socket) => {
        console.log(`New connection [ID]: ${socket.id}`);

        socket.data = socket.data || {};
        socket.data.connectedAt = new Date().toISOString();
        socket.data.email = '';

        // --- JOIN ROOM ---
        socket.on("join", async ({ roomName, email, password }) => {
            try {
                if (!email || !roomName) {
                    throw new Error("Email and room name are required");
                }

                const user = await UserModel.findOne({ email }).select("username");
                if (!user) {
                    throw new Error("User not found");
                }

                socket.data.email = email;
                socket.data.username = user.username;

                emailToSocketMapping.set(email, socket.id);
                console.log(`Mapped ${email} (${user.username}) to socket ${socket.id}`);

                const room = io.sockets.adapter.rooms.get(roomName);
                const isRoomFull = room && room.size >= 10000;

                if (isRoomFull) {
                    socket.emit("full", { roomName });
                    console.log(`Room ${roomName} is full`);
                    return;
                }

                // Join the room
                socket.join(roomName);

                // If creator (first user in room)
                if (!room) {
                    const newRoom = new Room({
                        roomName,
                        roomPassword: password,
                        createdBy: user._id,
                        joinees: [user._id]
                    });

                    const savedRoom = await newRoom.save();

                    const populatedRoom = await Room.findById(savedRoom._id)
                        .populate('createdBy', 'username email')
                        .populate('joinees', 'username email');

                    roomUsers.set(roomName, [{ email, username: user.username }]);
                    roomCreators.set(roomName, email);

                    console.log(`Room ${roomName} created by ${user.username}`);
                    socket.emit("created", {
                        roomName,
                        username: user.username,
                        roomDetails: {
                            id: populatedRoom._id,
                            roomName: populatedRoom.roomName,
                            createdBy: populatedRoom.createdBy,
                            joinees: populatedRoom.joinees,
                            joineeCount: populatedRoom.joinees.length,
                            createdAt: populatedRoom.createdAt,
                            updatedAt: populatedRoom.updatedAt
                        }
                    });
                } else {
                    // For joiner
                    const dbRoom = await Room.findOne({ roomName });
                    if (!dbRoom) {
                        throw new Error("Room does not exist");
                    }

                    if (dbRoom.roomPassword !== password) {
                        throw new Error("Incorrect password");
                    }

                    // Add user to joinees if not already present
                    if (!dbRoom.joinees.includes(user._id)) {
                        dbRoom.joinees.push(user._id);
                        await dbRoom.save();
                    }

                    // Get updated room details with populated fields
                    const updatedRoom = await Room.findById(dbRoom._id)
                        .populate('createdBy', 'username email')
                        .populate('joinees', 'username email');

                    const currentUsers = roomUsers.get(roomName) || [];
                    roomUsers.set(roomName, [...currentUsers, { email, username: user.username }]);

                    // Get creator's username
                    const creator = await UserModel.findById(dbRoom.createdBy).select("username");

                    console.log(`${user.username} joined ${roomName}`);
                    socket.emit("joined", {
                        roomName,
                        username: user.username,
                        creatorUsername: creator?.username,
                        users: [...currentUsers.map(u => u.username), user.username],
                        roomDetails: {
                            id: updatedRoom._id,
                            roomName: updatedRoom.roomName,
                            createdBy: updatedRoom.createdBy,
                            joinees: updatedRoom.joinees,
                            joineeCount: updatedRoom.joinees.length,
                            createdAt: updatedRoom.createdAt,
                            updatedAt: updatedRoom.updatedAt
                        }
                    });

                    // Notify existing users
                    socket.broadcast.to(roomName).emit("user-joined", {
                        username: user.username,
                        email,
                        roomName,
                        joineeCount: updatedRoom.joinees.length
                    });
                }
            } catch (error) {
                console.error("Join error:", error.message);
                socket.emit("error", { message: error.message });
            }
        });

        // --- KICK USER ---
        socket.on("kick-user", async ({ roomName, targetEmail }) => {
            try {
                console.log(`Kick request for ${targetEmail} in ${roomName}`);

                if (!roomName || !targetEmail) {
                    throw new Error("Room name and target email are required");
                }

                const dbRoom = await Room.findOne({ roomName });
                if (!dbRoom) {
                    throw new Error("Room not found");
                }

                const senderEmail = socket.data.email;
                const sender = await UserModel.findOne({ email: senderEmail });
                if (!sender || !dbRoom.createdBy.equals(sender._id)) {
                    throw new Error("Only room creator can kick users");
                }

                const targetSocketId = emailToSocketMapping.get(targetEmail);
                if (!targetSocketId) {
                    throw new Error("User not found in room");
                }

                const targetSocket = io.sockets.sockets.get(targetSocketId);
                if (!targetSocket) {
                    emailToSocketMapping.delete(targetEmail);
                    throw new Error("User connection not found");
                }

                const targetUser = await UserModel.findOne({ email: targetEmail }).select("username");
                const targetUsername = targetUser?.username || targetEmail;

                // Remove user from joinees in database
                dbRoom.joinees = dbRoom.joinees.filter(joineeId => !joineeId.equals(targetUser._id));
                await dbRoom.save();

                targetSocket.leave(roomName);
                emailToSocketMapping.delete(targetEmail);

                const users = roomUsers.get(roomName) || [];
                roomUsers.set(roomName, users.filter(u => u.email !== targetEmail));

                targetSocket.emit("kicked", {
                    roomName,
                    by: sender.username,
                    timestamp: new Date().toISOString()
                });

                io.to(roomName).emit("user-left", {
                    username: targetUsername,
                    email: targetEmail,
                    roomName,
                    wasKicked: true,
                    by: sender.username,
                    joineeCount: dbRoom.joinees.length
                });

                console.log(`${targetUsername} kicked from ${roomName} by ${sender.username}`);
            } catch (error) {
                console.error("Kick error:", error.message);
                socket.emit("error", { message: error.message });
            }
        });

        // --- LEAVE ROOM ---
        socket.on("leaveRoom", async (roomName) => {
            try {
                const email = socket.data.email;
                if (!email || !roomName) return;

                console.log(`Leave request for ${email} from ${roomName}`);

                const user = await UserModel.findOne({ email }).select("username");
                if (!user) return;

                // Remove user from database joinees
                const dbRoom = await Room.findOne({ roomName });
                if (dbRoom) {
                    dbRoom.joinees = dbRoom.joinees.filter(joineeId => !joineeId.equals(user._id));
                    await dbRoom.save();
                }

                socket.leave(roomName);

                const users = roomUsers.get(roomName) || [];
                const userIndex = users.findIndex(u => u.email === email);

                if (userIndex !== -1) {
                    const userInfo = users[userIndex];

                    const updatedUsers = users.filter(u => u.email !== email);
                    roomUsers.set(roomName, updatedUsers);
                    emailToSocketMapping.delete(email);

                    socket.broadcast.to(roomName).emit("user-left", {
                        username: userInfo.username,
                        email,
                        roomName,
                        wasKicked: false,
                        joineeCount: dbRoom ? dbRoom.joinees.length : 0
                    });

                    console.log(`${userInfo.username} left ${roomName}`);

                    if (updatedUsers.length === 0) {
                        roomMessages.delete(roomName)
                        console.log(`cleared messages from room :  ${roomName}`);
                    }
                }
            } catch (error) {
                console.error("Leave error:", error);
            }
        });

        // --- WEBRTC SIGNALING ---
        socket.on("ready", (roomName) => {
            const room = io.sockets.adapter.rooms.get(roomName);
            if (room) {
                room.forEach((socketId) => {
                    if (socketId !== socket.id) {
                        io.to(socketId).emit("ready", {
                            socketId: socket.id,
                            email: socket.data?.email,
                            username: socket.data?.username
                        });
                    }
                });
            }
        });

        socket.on("offer", (offer, roomName, targetSocketId) => {
            io.to(targetSocketId).emit("offer", {
                offer,
                sender: socket.id,
                senderEmail: socket.data?.email,
                senderUsername: socket.data?.username
            });
        });

        socket.on("answer", (answer, roomName, targetSocketId) => {
            io.to(targetSocketId).emit("answer", {
                answer,
                sender: socket.id,
                senderEmail: socket.data?.email,
                senderUsername: socket.data?.username
            });
        });

        socket.on("ice-candidate", (candidate, roomName, targetSocketId) => {
            io.to(targetSocketId).emit("ice-candidate", {
                candidate,
                sender: socket.id
            });
        });

        socket.on("stream-stopped", (roomName) => {
            socket.to(roomName).emit("stream-stopped");
        });

        // --- DISCONNECT ---
        socket.on("disconnect", async () => {
            try {
                const email = socket.data.email;
                if (email) {
                    emailToSocketMapping.delete(email);
                    console.log(`Removed mapping for ${email}`);
                }

                const rooms = Array.from(socket.rooms);
                const user = await UserModel.findOne({ email }).select("username");

                for (const roomName of rooms) {
                    if (roomName !== socket.id) {
                        const users = roomUsers.get(roomName) || [];
                        roomUsers.set(roomName, users.filter(u => u.email !== email));

                        // Remove from database joinees
                        const dbRoom = await Room.findOne({ roomName });
                        if (dbRoom && user) {
                            dbRoom.joinees = dbRoom.joinees.filter(joineeId => !joineeId.equals(user._id));
                            await dbRoom.save();

                            io.to(roomName).emit("user-disconnected", {
                                username: user.username,
                                email,
                                roomName,
                                joineeCount: dbRoom.joinees.length
                            });
                        }
                    }
                }
                if (updatedUsers.length === 0) {
                    roomMessages.delete(roomName);
                    console.log(`Cleared messages for empty room: ${roomName}`);
                }

                console.log(`Disconnected: ${user?.username || socket.id}`);
            } catch (error) {
                console.error("Disconnect error:", error);
            }
        });

        //JOINEE-READY SOCKET PART
        socket.on("joinee-ready", (roomName) => {
            const room = io.sockets.adapter.rooms.get(roomName)
            if (room) {
                room.forEach((socketId) => {
                    if (socketId !== socket.id) {
                        io.to(socketId).emit("joinee-ready", {
                            socketId: socket.id,
                            email: socket.data.email,
                            username: socket.data.username
                        })
                    }
                })
            }
        })
        //MESSAGEING HANDLER

        socket.on("send-message", async (data) => {

            try {

                const { roomName, message, sender, senderEmail, timestamp } = data
                if (!message || !roomName) return;

                //initialize message storage for room if not already
                if (!roomMessages.has(roomName)) {
                    roomMessages.set(roomName, [])
                }

                const messageObj = {
                    id: Date.now().toString() + Math.random().toString().substr(2, 5),
                    sender,
                    senderEmail,
                    message,
                    roomName,
                    timestamp: timestamp || new Date().toISOString()
                }
                //Add messages to room history
                const Addmessages = roomMessages.get(roomName)
                Addmessages.push(messageObj)

                //keep only the last 100 messages per room
                if (Addmessages.length > 100) { Addmessages.shift() }

                //broadcasting all users
                io.to(roomName).emit("message-received", messageObj)
                console.log(`messages from ${sender} in ${roomName} : ${message}`);

            }
            catch (e) {
                console.log(e);
            }
        })

        //mesage history request k liye handler
        socket.on("request-message-history", (roomName) => {
            const messages = roomMessages.get(roomName) || 'no messages yet'
            socket.emit("message-history", messages)
        })
        socket.on("error", (error) => {
            console.error(`Socket error [${socket.id}]:`, error);
        });
    });

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, (err) => {
        if (err) throw err;
        console.log(`> Ready on http://localhost:${PORT}`);
    });
});