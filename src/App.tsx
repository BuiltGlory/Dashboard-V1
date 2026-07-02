import { createBrowserRouter, RouterProvider } from 'react-router'
import { adminRoutes } from '@/routes/adminRoutes'

const router = createBrowserRouter(adminRoutes)

export default function App() {
  return <RouterProvider router={router} />
}
