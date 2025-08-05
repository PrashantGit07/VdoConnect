"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { io } from "socket.io-client"

const SocketContext = createContext({ socket: null, isConnected: false })

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = (props) => {
    const [socket, setSocket] = useState(null)
    const [isConnected, setIsConnected] = useState(false)

    useEffect(() => {
        const initializeSocket = async () => {

            await fetch("/api/socket")

            const socketInstance = io("http://localhost:3001", {
                path: "/api/socket",
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
                transports: ["websocket", "polling"]
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

            return () => {
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