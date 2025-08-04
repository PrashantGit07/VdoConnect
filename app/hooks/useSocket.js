"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { io } from "socket.io-client"

const SocketContext = createContext({ socket: null, isConnected: false })


export const useSocket = () => {
    return useContext(SocketContext)
}


export const SocketProvider = (props) => {

    //const socket = useMemo(() => io(window.location.origin), [])

    const [socket, setSocket] = useState(null)
    const [isConnected, setIsConnected] = useState(false)

    useEffect(() => {
        import("socket.io-client").then((module) => {
            const io = module.default
            const socketInstance = io("http://localhost:3000", {
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000
            })

            setSocket(socketInstance)

            socketInstance.on("connect", () => {
                setIsConnected = true
                console.log("connected to socket server")
            })

            socketInstance.on("disconnect", () => {
                setIsConnected(false)
                console.log("disconnected to socket server")
            })
            return () => {
                if (socketInstance) socketInstance.disconnect()
            }
        })
    }, [])
    return (
        <SocketContext.Provider value={{ socket, isConnected }}>
            {props.children}
        </SocketContext.Provider>
    )
}