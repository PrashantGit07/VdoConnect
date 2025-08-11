import { SocketProvider } from './hooks/useSocket'
import AuthPage from './pages/user/page'

export default function Home() {
  return (
    <SocketProvider>
      <div className="text-3xl text-center font-bold mt-10">Video Call App</div>
      <AuthPage />
    </SocketProvider>
  )
}