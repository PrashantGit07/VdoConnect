import { Server } from "socket.io";
import { Room } from "../config/Models/RoomModel";
import { UserModel } from "../config/Models/UserModel";

let io;

const emailToSocketMapping = new Map();
const roomCreators = new Map();
const roomUsers = new Map(); // Map<roomName, {email: string, username: string}[]>

export const initSocketServer = (httpServer) => {
  if (io) return io;

  console.log("Initializing Socket.IO Server");

  io = new Server(httpServer, {
    path: "/api/socket",
    addTrailingSlash: false,
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`New connection [ID]: ${socket.id}`);

    // Track connection time for debugging
    socket.data.connectedAt = new Date().toISOString();

    // --- JOIN ROOM ---
    socket.on("join", async ({ roomName, email, password }) => {
      try {
        if (!email || !roomName) {
          throw new Error("Email and room name are required");
        }

        socket.data.email = email;
        emailToSocketMapping.set(email, socket.id);
        console.log(`Mapped ${email} to socket ${socket.id}`);

        const user = await UserModel.findOne({ email }).select("username");
        if (!user) {
          throw new Error("User not found");
        }

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
            createdBy: user._id
          });

          await newRoom.save();
          roomUsers.set(roomName, [{ email, username: user.username }]);
          roomCreators.set(roomName, email);

          console.log(`Room ${roomName} created by ${user.username}`);
          socket.emit("created", {
            roomName,
            username: user.username,
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

          console.log(`${user.username} joined ${roomName}`);
          socket.emit("joined", {
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
          by: sender.username
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

        socket.leave(roomName);

        const users = roomUsers.get(roomName) || [];
        const userIndex = users.findIndex(u => u.email === email);

        if (userIndex !== -1) {
          const user = users[userIndex];

          const updatedUsers = users.filter(u => u.email !== email);
          roomUsers.set(roomName, updatedUsers);
          emailToSocketMapping.delete(email);

          socket.broadcast.to(roomName).emit("user-left", {
            username: user.username,
            email,
            roomName,
            wasKicked: false
          });

          if (updatedUsers.length === 0) {
            await Room.deleteOne({ roomName });
            roomUsers.delete(roomName);
            roomCreators.delete(roomName);
            console.log(`Room ${roomName} deleted (empty)`);
          }

          console.log(`${user.username} left ${roomName}`);
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
          console.log(`Removed mapping for ${email}`);
        }

        const rooms = Array.from(socket.rooms);
        const user = await UserModel.findOne({ email }).select("username");

        rooms.forEach(async (roomName) => {
          if (roomName !== socket.id) {
            const users = roomUsers.get(roomName) || [];
            roomUsers.set(roomName, users.filter(u => u.email !== email));

            io.to(roomName).emit("user-disconnected", {
              username: user?.username,
              email,
              roomName
            });

            if (users.length <= 1) {
              await Room.deleteOne({ roomName });
              roomUsers.delete(roomName);
              roomCreators.delete(roomName);
              console.log(`Room ${roomName} deleted (disconnect)`);
            }
          }
        });

        console.log(`Disconnected: ${user?.username || socket.id}`);
      } catch (error) {
        console.error("Disconnect error:", error);
      }
    });

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