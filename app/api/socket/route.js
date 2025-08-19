import { initSocketServer } from "@/app/lib/socket-server";
import { NextResponse } from "next/server";

let io;
let httpServer
export const GET = async () => {
    try {
        if (io) {
            return NextResponse.json(
                { message: "Socket already connected" },
                { status: 200 }
            );
        }

        const { Server } = await import('http');
        httpServer = new Server();

        io = initSocketServer(httpServer);

        httpServer.listen(3001, () => {
            console.log(`socket server is listening on port 3001`)
        });

        return NextResponse.json(
            { message: "Socket server initialized" },
            { status: 200 }
        );
    } catch (e) {
        console.log(e);
        return NextResponse.json(
            { message: "Error connecting to socket server", error: e.message },
            { status: 500 }
        );
    }
};

// "dev": "next dev --turbopack",