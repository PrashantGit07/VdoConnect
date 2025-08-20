
"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { io } from "socket.io-client"

const SocketContext = createContext({ socket: null, isConnected: false })

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = (props) => {
    const [socket, setSocket] = useState(null)
    const [isConnected, setIsConnected] = useState(false)

    useEffect(() => {
        const initializeSocket = async () => { //a function to create a socket instance this function will run when a component mounts
            const socketInstance = io({ //creating a socket connection to out path where socket.io is attached in serevr.js
                path: "/api/socket",

                transports: ["websocket", "polling"],

                upgrade: true,

                rememberUpgrade: true,

                forceNew: true,   //ensures a new socket is created instead of reusing an old one.

                reconnection: true,   //auto connect if connection is dropped

                reconnectionAttempts: 5,

                reconnectionDelay: 1000,

                timeout: 20000,  //if no response withing 20 sec. , drop the connection

                withCredentials: true,

                autoConnect: true
            });

            setSocket(socketInstance)

            socketInstance.on("connect", () => {
                setIsConnected(true)
                console.log("Connected to socket server")
            })

            socketInstance.on("disconnect", () => {
                setIsConnected(false)
                console.log("Disconnected from socket server")
            });

            return () => { //if component unmounts , the socket connection is closed properly closed, it prevents multiple open connections which avoids duplicate messagin or memory leaks
                if (socketInstance) socketInstance.disconnect()
            }
        }
        initializeSocket().catch(console.error)

        return () => {
            if (socket) socket.disconnect();
        };

    }, [])

    return (
        <SocketContext.Provider value={{ socket, isConnected }}>
            {props.children}
        </SocketContext.Provider>
    )
}