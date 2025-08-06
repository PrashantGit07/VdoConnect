 import { Server } from "socket.io";

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
    console.log(`✅ User connected: ${socket.id}`);

    // --- JOIN ROOM ---
    socket.on("join", ({ roomName, email }) => {
      socket.data.email = email;

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
        roomCreators.set(roomName, email);
        roomUsers.set(roomName, [email]);

        socket.emit("created", { roomName, email });
        console.log(`🏠 Room created by ${email}`);
      } else {
        const currentUsers = roomUsers.get(roomName) || [];
        roomUsers.set(roomName, [...currentUsers, email]);

        const creatorEmail = roomCreators.get(roomName);
        socket.emit("joined", {
          roomName,
          email,
          creatorEmail,
          users: [...currentUsers, email],
        });

        // Notify existing users
        socket.broadcast.to(roomName).emit("user-joined", {
          email,
          roomName,
        });

        console.log(`➕ User ${email} joined room ${roomName}`);
      }
    });

    // --- READY / ICE / OFFER / ANSWER ---
    socket.on("ready", (roomName) => {
      socket.broadcast.to(roomName).emit("ready", {
        email: socket.data.email,
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
    socket.on("leaveRoom", (roomName) => {
      socket.leave(roomName);

      const email = socket.data.email;
      const users = roomUsers.get(roomName) || [];
      roomUsers.set(roomName, users.filter((e) => e !== email));

      socket.broadcast.to(roomName).emit("user-left", {
        email,
        roomName,
      });

      console.log(`🚪 User ${email} left room ${roomName}`);
    });

    // --- KICK USER ---
    socket.on("kick-user", ({ roomName, targetEmail }) => {
      const creator = roomCreators.get(roomName);
      const senderEmail = socket.data.email;

      if (creator !== senderEmail) return;

      const targetSocketId = emailToSocketMapping.get(targetEmail);
      if (!targetSocketId) return;

      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (!targetSocket) return;

      targetSocket.leave(roomName);
      targetSocket.emit("kicked", {
        roomName,
        by: senderEmail,
      });

      const users = roomUsers.get(roomName) || [];
      roomUsers.set(roomName, users.filter((e) => e !== targetEmail));

      socket.broadcast.to(roomName).emit("user-left", {
        email: targetEmail,
        roomName,
      });

      console.log(`⛔ User ${targetEmail} was kicked from room ${roomName}`);
    });

    // --- DISCONNECT ---
    socket.on("disconnect", () => {
      const email = socket.data.email;
      const rooms = Array.from(socket.rooms);

      rooms.forEach((roomName) => {
        if (roomName !== socket.id) {
          socket.broadcast.to(roomName).emit("user-disconnected", {
            email,
            roomName,
          });

          const users = roomUsers.get(roomName) || [];
          roomUsers.set(roomName, users.filter((e) => e !== email));
        }
      });

      emailToSocketMapping.delete(email);

      console.log(`❌ Disconnected: ${email || socket.id}`);
    });
  });

  return io;
};

//setting up singleton Socket.IO server instance and attaching it to the HTTP server so that clients can connect and communicate in real-time



// const SocketHandler = (req, res) => {
//     if (res.socket.server.io) {

//         //checking if socket is already attached to the HTTP server to avoid multiple instances
//         // If it is, we can skip the initialization

//         console.log("Server is already running");  //if exists , log it and exit
//         return res.end()
//     }

//     let io;
//     // If it doesn't exist, we create a new instance of Socket.IO and attach it to the HTTP server

//     if (!io) {


//         console.log("Initializing Socket.IO");

//         io = new Server(res.socket.server, {
//             path: '/pages/socket',
//             addTrailingSlash: false,
//             cors: {
//                 origin: '*',
//                 methods: ["GET", "POST"]
//             }
//         });
//         res.socket.server.io = io


//         // Here you can set up your socket event listeners
//         //this callback will be executed when a new client connects to the server

//         io.on("connection", (socket) => {
//             console.log(`User connected : ${socket.id}`); //logs unique socket id of the connected user
//             //THERE ARF CERTAIN EVENTS THAT YOU CAN LISTEN TO AND RESPOND TO


//             //when a socket receives a JOIN event , it can go one of three different ways ->

//             //nobody in the room -> emits CREATE evnet
//             //somebody in the room -> emits JOINED event
//             //if room is full -> emits FULL event


//             /*  
//            When the socket receives a ready event, it broadcasts [ready] to the room
        
//            When the socket receives an offer event, it broadcasts [offer] to the room with the offer data
        
//            When the socket receives an answer event, it broadcasts [answer] to the room with the answer data
        
//            When it receives the ice - candidate event, it broadcasts [ice - candidate] to the room with the ice - candidates it receives
        
//            When it receives the leave event, it broadcasts the [leave] event to the room   */


//             //one by one events here


//             //a mapping of socket with users

//             const emailToSocketMapping = new Map()

//             //1 -> join


//             socket.on("join", ({ roomName, email }) => {
//                 const { rooms } = io.sockets.adapter
//                 const room = rooms.get(roomName)


//                 socket.data.email = email

//                 if (room === undefined) {
//                     //nobody in the room
//                     socket.join(roomName)
//                     emailToSocketMapping.set(email, socket.id)

//                     socket.broadcast.to(roomName).emit(`User created room ${email} with room ${roomName}`) //emit create event to the user

//                     console.log("user", email, "joined", roomName);

//                 }
//                 else if (room.size === 1) {
//                     //someone in the room
//                     socket.join(roomName).
//                         emailToSocketMapping.set(email, socket.id)
//                     socket.broadcast.to(roomName).emit("user joined : ", { email })
//                     console.log("user", email, "joined", roomName);

//                 }
//                 else {
//                     //room is full
//                     socket.emit("full", roomName)  //emit full event to the user
//                     console.log(`User ${email} tried to join full room ${roomName}`);
//                 }

//                 console.log(rooms);

//             })



//             //2 -> ready
//             socket.on("ready", roomName => {
//                 console.log(`User ${socket.data.email} is ready in room ${roomName}`);
//                 socket.broadcast.to(roomName).emit("ready", {
//                     email: socket.data.email
//                 }) //informs the other peer in the room that the user is ready
//             })


//             //3 -> ICE-CANDIDATE
//             socket.on("ice-candidate", (candidate, roomName) => {
//                 console.log(`ICE candidate from ${socket.data.email} in room ${roomName}`, candidate);
//                 socket.broadcast.to(roomName).emit("ice-candidate", candidate) // Sends ice-candidate to the other peer in the room.
//             })



//             //4 -> offer
//             socket.on("offer", (offer, roomName) => {
//                 console.log(`Offer from ${socket.data.email} in room ${roomName}`);
//                 socket.broadcast.to(roomName).emit("offer", offer) //broadcasts the offer to the room
//             })


//             //5-> ANSWER
//             socket.on("answer", (answer, roomName) => {
//                 console.log(`Answer from ${socket.data.email} in room ${roomName}`);
//                 socket.broadcast.to(roomName).emit("answer", answer) // Sends Answer to the other peer in the room.
//             })


//             //6 -> LEAVE

//             socket.on("leave", (roomName) => {
//                 console.log(`User ${socket.data.email} left room ${roomName}`);
//                 socket.broadcast.to(roomName).emit("leave", {
//                     email: socket.data.email
//                 }) //informs the other peer in the room that the user has left
//             })
//         })
//     }
//     return res.end()  //ending http response since we are just initializing the socket server not sending any data back
// }

// export default SocketHandler