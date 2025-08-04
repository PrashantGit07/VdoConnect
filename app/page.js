import { SocketProvider } from './hooks/useSocket'
import Hello from './pages/Hello'

export default function Home() {
  return (
    <SocketProvider>
      <div className="text-3xl text-center font-bold mt-10">Video Call App</div>
      <div className="mt-8">
        <Hello />
      </div>
    </SocketProvider>
  )
}