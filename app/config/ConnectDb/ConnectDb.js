import mongoose from "mongoose";

export const ConnectDb = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URL)
        // console.log("connection string: " + process.env.MONGO_URL)
        console.log("Connected to database successfully")
    }
    catch (e) {
        console.log("Error connecting to MongoDB , " + e)
        process.exit(1)
    }


    mongoose.connection.on("error", (err) => {
        console.log("MongoDB connection error: " + err)
        process.exit(1)
    })
}