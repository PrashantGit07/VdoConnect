import { Server } from "socket.io";
import { Room } from "../config/Models/RoomModel";
import { UserModel } from "../config/Models/UserModel";

let io;

const emailToSocketMapping = new Map();
const roomCreators = new Map();
const roomUsers = new Map(); // Map<roomName, {email: string, username: string}[]>

export const initSocketServer = (httpServer) => {
  if (io) return io;

  console.log("🔌 Initializing Socket.IO Server");

  io = new Server(httpServer, {
    path: "/api/socket",
    addTrailingSlash: false,
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // Periodic cleanup of stale connections
  setInterval(() => {
    console.log("🔄 Running connection cleanup...");
    const currentTime = Date.now();

    for (const [email, socketId] of emailToSocketMapping.entries()) {
      const socket = io.sockets.sockets.get(socketId);
      if (!socket) {
        emailToSocketMapping.delete(email);
        console.log(`🧹 Cleaned up stale mapping for ${email}`);
      }
    }
  }, 60000); // Run every minute

  io.on("connection", (socket) => {
    console.log(`✅ New connection [ID]: ${socket.id}`);

    // Track connection time for debugging
    socket.data.connectedAt = new Date().toISOString();

    // --- JOIN ROOM ---
    socket.on("join", async ({ roomName, email, password }, callback) => {
      try {
        console.log(`🚪 Join attempt: ${email} to ${roomName}`);

        // Validate input
        if (!email || !roomName) {
          throw new Error("Email and room name are required");
        }

        socket.data.email = email;
        emailToSocketMapping.set(email, socket.id);
        console.log(`📌 Mapped ${email} to socket ${socket.id}`);

        // Get user from database
        const user = await UserModel.findOne({ email }).select("username");
        if (!user) {
          throw new Error("User not found");
        }

        const room = io.sockets.adapter.rooms.get(roomName);
        const isRoomFull = room && room.size >= 10000;

        if (isRoomFull) {
          socket.emit("full", { roomName });
          console.log(`⚠️ Room ${roomName} is full`);
          return callback({ error: "Room is full" });
        }

        // Join the room
        socket.join(roomName);

        // If creator (first user in room)
        if (!room) {
          // Create room in database
          const newRoom = new Room({
            roomName,
            roomPassword: password,
            createdBy: user._id
          });

          await newRoom.save();
          roomUsers.set(roomName, [{ email, username: user.username }]);
          roomCreators.set(roomName, email);

          console.log(`🏠 Room ${roomName} created by ${user.username}`);
          callback({
            status: "created",
            roomName,
            username: user.username
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

          const currentUsers = roomUsers.get(roomName) || [];
          roomUsers.set(roomName, [...currentUsers, { email, username: user.username }]);

          // Get creator's username
          const creator = await UserModel.findById(dbRoom.createdBy).select("username");

          console.log(`➕ ${user.username} joined ${roomName}`);
          callback({
            status: "joined",
            roomName,
            username: user.username,
            creatorUsername: creator?.username,
            users: [...currentUsers.map(u => u.username), user.username],
          });

          // Notify existing users
          socket.broadcast.to(roomName).emit("user-joined", {
            username: user.username,
            email,
            roomName,
          });
        }
      } catch (error) {
        console.error("Join error:", error.message);
        callback({ error: error.message });
        socket.emit("error", { message: error.message });
      }
    });

    // --- KICK USER ---
    socket.on("kick-user", async ({ roomName, targetEmail }, callback) => {
      try {
        console.log(`👢 Kick request for ${targetEmail} in ${roomName}`);

        if (!roomName || !targetEmail) {
          throw new Error("Room name and target email are required");
        }

        // Verify room exists
        const dbRoom = await Room.findOne({ roomName });
        if (!dbRoom) {
          throw new Error("Room not found");
        }

        // Verify sender is creator
        const senderEmail = socket.data.email;
        const sender = await UserModel.findOne({ email: senderEmail });
        if (!sender || !dbRoom.createdBy.equals(sender._id)) {
          throw new Error("Only room creator can kick users");
        }

        // Verify target exists
        const targetSocketId = emailToSocketMapping.get(targetEmail);
        if (!targetSocketId) {
          console.log("Current mappings:", Array.from(emailToSocketMapping.entries()));
          throw new Error("User not found in room");
        }

        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (!targetSocket) {
          emailToSocketMapping.delete(targetEmail); // Clean up stale mapping
          throw new Error("User connection not found");
        }

        // Get usernames for logging
        const targetUser = await UserModel.findOne({ email: targetEmail }).select("username");
        const targetUsername = targetUser?.username || targetEmail;

        // Perform kick
        targetSocket.leave(roomName);
        emailToSocketMapping.delete(targetEmail);

        // Update room users
        const users = roomUsers.get(roomName) || [];
        roomUsers.set(roomName, users.filter(u => u.email !== targetEmail));

        // Notify target
        targetSocket.emit("kicked", {
          roomName,
          by: sender.username,
          timestamp: new Date().toISOString()
        });

        // Notify others
        io.to(roomName).emit("user-left", {
          username: targetUsername,
          email: targetEmail,
          roomName,
          wasKicked: true,
          by: sender.username
        });

        console.log(`⛔ ${targetUsername} kicked from ${roomName} by ${sender.username}`);
        callback({ success: true });
      } catch (error) {
        console.error("Kick error:", error.message);
        callback({ error: error.message });
        socket.emit("error", { message: error.message });
      }
    });

    // --- LEAVE ROOM ---
    socket.on("leaveRoom", async (roomName) => {
      try {
        console.log(`🚪 Leave request for ${socket.data.email} from ${roomName}`);

        if (!roomName) return;

        socket.leave(roomName);

        const email = socket.data.email;
        const users = roomUsers.get(roomName) || [];
        const user = users.find(u => u.email === email);

        if (user) {
          // Update room users
          roomUsers.set(roomName, users.filter(u => u.email !== email));
          emailToSocketMapping.delete(email);

          // Notify others
          socket.broadcast.to(roomName).emit("user-left", {
            username: user.username,
            email,
            roomName,
            wasKicked: false
          });

          // If room is empty, clean up
          if (users.length <= 1) {
            await Room.deleteOne({ roomName });
            roomUsers.delete(roomName);
            roomCreators.delete(roomName);
            console.log(`🗑️ Room ${roomName} deleted (empty)`);
          }

          console.log(`👋 ${user.username} left ${roomName}`);
        }
      } catch (error) {
        console.error("Leave error:", error);
      }
    });

    // --- WEBRTC SIGNALING ---
    socket.on("ready", (roomName) => {
      socket.broadcast.to(roomName).emit("ready", {
        socketId: socket.id,
        email: socket.data.email
      });
    });

    socket.on("ice-candidate", (candidate, roomName) => {
      socket.broadcast.to(roomName).emit("ice-candidate", {
        candidate,
        sender: socket.id
      });
    });

    socket.on("offer", (offer, roomName) => {
      socket.broadcast.to(roomName).emit("offer", {
        offer,
        sender: socket.id
      });
    });

    socket.on("answer", (answer, roomName) => {
      socket.broadcast.to(roomName).emit("answer", {
        answer,
        sender: socket.id
      });
    });

    // --- DISCONNECT ---
    socket.on("disconnect", async () => {
      try {
        const email = socket.data.email;
        if (email) {
          emailToSocketMapping.delete(email);
          console.log(`🗑️ Removed mapping for ${email}`);
        }

        const rooms = Array.from(socket.rooms);
        const user = await UserModel.findOne({ email }).select("username");

        rooms.forEach(async (roomName) => {
          if (roomName !== socket.id) {
            // Update room users
            const users = roomUsers.get(roomName) || [];
            roomUsers.set(roomName, users.filter(u => u.email !== email));

            // Notify others
            io.to(roomName).emit("user-disconnected", {
              username: user?.username,
              email,
              roomName
            });

            // Clean up empty rooms
            if (users.length <= 1) {
              await Room.deleteOne({ roomName });
              roomUsers.delete(roomName);
              roomCreators.delete(roomName);
              console.log(`🗑️ Room ${roomName} deleted (disconnect)`);
            }
          }
        });

        console.log(`❌ Disconnected: ${user?.username || socket.id}`);
      } catch (error) {
        console.error("Disconnect error:", error);
      }
    });

    // Error handler
    socket.on("error", (error) => {
      console.error(`Socket error [${socket.id}]:`, error);
    });
  });

  return io;
};

export const getSocketServer = () => {
  if (!io) throw new Error("Socket.IO server not initialized");
  return io;
};