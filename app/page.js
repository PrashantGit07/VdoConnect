import { SocketProvider } from './hooks/useSocket'
import HomePage from './pages/Hello/page'
export default function Home() {
  return (
    <SocketProvider>
      <div className="text-3xl text-center font-bold mt-10">Video Call App</div>
      <div className="mt-8">
        <HomePage />
      </div>
    </SocketProvider>
  )
}