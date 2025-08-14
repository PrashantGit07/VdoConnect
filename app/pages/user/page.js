// app/auth/page.jsx
"use client";
import { useState } from "react";
import axios from "axios";
import toast, { Toaster } from "react-hot-toast";
import { motion } from "framer-motion";
import { FaUser, FaEnvelope, FaLock } from "react-icons/fa";
import { useRouter } from "next/navigation";

export default function AuthPage() {
    const [isLogin, setIsLogin] = useState(true);
    const [formData, setFormData] = useState({ username: "", email: "", password: "" });
    const [loading, setLoading] = useState(false);
    const router = useRouter()
    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleLogin = async () => {
        try {
            const { data } = await axios.post("/api/user/login", {
                email: formData.email,
                password: formData.password,
            });
            toast.success(data.message);
            router.push("/pages/connect-room")
        } catch (err) {
            toast.error(err.response?.data?.message || "Login failed");
        }
    };

    const handleSignup = async () => {
        try {
            const { data } = await axios.post("/api/user/singup", {
                username: formData.username,
                email: formData.email,
                password: formData.password,
            });
            toast.success(data.message);
            router.push("/pages/connect-room")
        } catch (err) {
            toast.error(err.response?.data?.message || "Signup failed");
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        if (isLogin) {
            await handleLogin();
        } else {
            await handleSignup();
        }
        setLoading(false);
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-black via-[#0a0f1e] to-[#1e3a5f]">
            <Toaster position="top-center" />
            <motion.div
                initial={{ opacity: 0, y: 50, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="w-full max-w-md rounded-2xl border border-blue-500/40 p-8 backdrop-blur-lg bg-[#0f172a]/80 shadow-[0_0_40px_rgba(59,130,246,0.3)]"
            >
                <motion.h1
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, duration: 0.4 }}
                    className="text-3xl font-extrabold text-center mb-6 text-blue-400 drop-shadow-[0_0_5px_rgba(59,130,246,0.6)]"
                >
                    {isLogin ? "Welcome Back" : "Create Account"}
                </motion.h1>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {!isLogin && (
                        <div className="relative">
                            <FaUser className="absolute left-3 top-3 text-gray-400" />
                            <input
                                type="text"
                                name="username"
                                placeholder="Username"
                                value={formData.username}
                                onChange={handleChange}
                                className="w-full pl-10 pr-4 py-3 rounded-lg bg-[#1e293b]/80 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                            />
                        </div>
                    )}
                    <div className="relative">
                        <FaEnvelope className="absolute left-3 top-3 text-gray-400" />
                        <input
                            type="email"
                            name="email"
                            placeholder="Email"
                            value={formData.email}
                            onChange={handleChange}
                            className="w-full pl-10 pr-4 py-3 rounded-lg bg-[#1e293b]/80 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                        />
                    </div>
                    <div className="relative">
                        <FaLock className="absolute left-3 top-3 text-gray-400" />
                        <input
                            type="password"
                            name="password"
                            placeholder="Password"
                            value={formData.password}
                            onChange={handleChange}
                            className="w-full pl-10 pr-4 py-3 rounded-lg bg-[#1e293b]/80 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                        />
                    </div>

                    <motion.button
                        whileHover={{ scale: 1.05, boxShadow: "0px 0px 20px rgba(59,130,246,0.6)" }}
                        whileTap={{ scale: 0.95 }}
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 rounded-lg bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-400 hover:to-blue-600 transition-colors text-white font-semibold cursor-pointer"
                    >
                        {loading ? "Bhai bas ek second.." : isLogin ? "Login" : "Sign Up"}
                    </motion.button>
                </form>

                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-gray-400 text-sm mt-6 text-center"
                >
                    {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
                    <button
                        onClick={() => setIsLogin(!isLogin)}
                        className="text-blue-400 hover:underline cursor-pointer"
                    >
                        {isLogin ? "Sign up" : "Login"}
                    </button>
                </motion.p>
            </motion.div>
        </div>
    );
}
