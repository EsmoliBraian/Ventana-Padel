import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/admin/Sidebar'
import { PlanBanner } from '@/components/admin/PlanBanner'
import '@fortawesome/fontawesome-free/css/all.min.css'

export function AdminLayout() {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        <PlanBanner />
        <Outlet />
      </main>
    </div>
  )
}
