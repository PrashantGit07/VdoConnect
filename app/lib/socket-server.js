import { Server } from "socket.io";
import { Room } from "../config/Models/RoomModel";
import { UserModel } from "../config/Models/UserModel";

let io;

const emailToSocketMapping = new Map();
const roomCreators = new Map();
const roomUsers = new Map(); // Map<roomName, string[]>

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

  io.on("connection", (socket) => {
    console.log(`✅ User connected [socket ID]: ${socket.id}`);

    // --- JOIN ROOM ---
    socket.on("join", async ({ roomName, email, password }) => {
      socket.data.email = email;


      //checking if user exists in db , and getting his username

      const user = await UserModel.findOne({ email }).select("username")

      if (!user) {
        socket.emit("error", { message: "User not found" });
        console.log(`❌ User ${email} not found`);
        return;
      }
      const room = io.sockets.adapter.rooms.get(roomName);
      const isRoomFull = room && room.size >= 10000;

      if (isRoomFull) {
        socket.emit("full", { roomName });
        console.log(`⚠️ Room ${roomName} is full`);
        return;
      }

      // Join the room
      socket.join(roomName);
      emailToSocketMapping.set(email, socket.id);

      // If creator
      if (!room) {

        //creating room entry in db

        const newRoom = new Room({
          roomName,
          roomPassword: password,
          createdBy: user._id
        })

        await newRoom.save();


        roomUsers.set(roomName, [{ email, username: user.username }]);

        socket.emit("created", { roomName, username: user.username });

        console.log(`🏠 Room ${roomName} created by ${user.username}`);


      } else {

        //checking if room exists in db and password is correct (for joinee)

        const dbRoom = await Room.findOne({ roomName })

        if (!dbRoom) {
          socket.emit("error", { message: "Room does not exist" });
          console.log(`❌ Room ${roomName} does not exist`);
          return;
        }

        if (dbRoom.roomPassword !== password) {
          socket.emit("error", { message: "Incorrect password" });
          console.log(`❌ Incorrect password for room ${roomName}`);
          return;
        }


        const currentUsers = roomUsers.get(roomName) || [];
        roomUsers.set(roomName, [...currentUsers, { email, username: user.username }]);


        //getting creators username

        const creatorUsername = await UserModel.findById(dbRoom.createdBy).select("username");



        socket.emit("joined", {
          roomName,
          username: user.username,
          creatorUsername: creatorUsername?.username,

          users: [...currentUsers.map(u => u.username), user?.username],
        });

        // Notify existing users
        socket.broadcast.to(roomName).emit("user-joined", {
          username: user.username,
          roomName,
        });

        console.log(`➕ User ${email} joined room ${roomName}`);
      }
    });

    // --- READY / ICE / OFFER / ANSWER ---
    socket.on("ready", (roomName) => {
      socket.broadcast.to(roomName).emit("ready", {
        username: socket.data.username,
      });
    });

    socket.on("ice-candidate", (candidate, roomName) => {
      socket.broadcast.to(roomName).emit("ice-candidate", candidate);
    });

    socket.on("offer", (offer, roomName) => {
      socket.broadcast.to(roomName).emit("offer", offer);
    });

    socket.on("answer", (answer, roomName) => {
      socket.broadcast.to(roomName).emit("answer", answer);
    });

    // --- LEAVE ROOM ---

    socket.on("leaveRoom", async (roomName) => {
      try {
        socket.leave(roomName);

        const email = socket.data.email;
        const users = roomUsers.get(roomName) || [];
        const user = users.find(u => u.email === email);
        roomUsers.set(roomName, users.filter((u) => u.email !== email));

        socket.broadcast.to(roomName).emit("user-left", {
          username: user?.username,
          roomName,
        });

        // If room is empty, delete it from database

        if (users.length <= 1) {
          await Room.deleteOne({ roomName });
          console.log(`🗑️ Room ${roomName} deleted from database`);
        }

        console.log(`🚪 User ${user?.username} left room ${roomName}`);
      } catch (error) {
        console.error("Error leaving room:", error);
      }
    });


    //KICK USER

    socket.on("kick-user", async ({ roomName, targetEmail }) => {
      try {
        const dbRoom = await Room.findOne({ roomName });
        if (!dbRoom) {
          socket.emit("error", { message: "Room not found" });
          return;
        }

        // Check if sender is the creator
        const senderEmail = socket.data.email;
        const sender = await UserModel.findOne({ email: senderEmail });
        if (!sender || !dbRoom.createdBy.equals(sender._id)) {
          return;
        }

        const targetSocketId = emailToSocketMapping.get(targetEmail);
        if (!targetSocketId) return;

        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (!targetSocket) return;

        const targetUser = await UserModel.findOne({ email: targetEmail }).select('username');

        targetSocket.leave(roomName);
        targetSocket.emit("kicked", {
          roomName,
          by: sender.username,
        });

        const users = roomUsers.get(roomName) || [];
        roomUsers.set(roomName, users.filter((u) => u.email !== targetEmail));

        socket.broadcast.to(roomName).emit("user-left", {
          username: targetUser?.username,
          roomName,
        });

        console.log(`⛔ User ${targetUser?.username} was kicked from room ${roomName}`);
      } catch (error) {
        console.error("Error kicking user:", error);
      }
    });


    // --- DISCONNECT ---
    socket.on("disconnect", async () => {
      try {
        const email = socket.data.email;
        const user = await UserModel.findOne({ email }).select('username');
        const rooms = Array.from(socket.rooms);

        rooms.forEach(async (roomName) => {
          if (roomName !== socket.id) {
            socket.broadcast.to(roomName).emit("user-disconnected", {
              username: user?.username,
              roomName,
            });

            const users = roomUsers.get(roomName) || [];
            roomUsers.set(roomName, users.filter((u) => u.email !== email));

            // If room is empty, delete it from database
            if (users.length <= 1) {
              await Room.deleteOne({ roomName });
              console.log(`🗑️ Room ${roomName} deleted from database`);
            }
          }
        });

        emailToSocketMapping.delete(email);

        console.log(`❌ Disconnected: ${user?.username || socket.id}`);
      } catch (error) {
        console.error("Error during disconnect:", error);
      }
    });
  });

  return io;
};
