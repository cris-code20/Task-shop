'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface OnlineUser {
  id: string
  email: string
  last_seen: string
}

export default function UserList() {
  const [users, setUsers] = useState<OnlineUser[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)

  useEffect(() => {
    fetchUsers()
    
    // Obtener usuario actual
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUser(user)
    }
    getCurrentUser()

    // Suscribirse a cambios en la tabla de usuarios
    const subscription = supabase
      .channel('online_users')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'profiles' }, 
        () => {
          fetchUsers()
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const fetchUsers = async () => {
    // En una aplicación real, deberías tener una tabla de perfiles
    // Para este ejemplo, simulamos usuarios en línea
    const { data: authUsers, error } = await supabase.auth.admin.listUsers()
    
    if (!error && authUsers) {
      const userList = authUsers.users.map(user => ({
        id: user.id,
        email: user.email || 'Usuario sin email',
        last_seen: new Date().toISOString()
      }))
      setUsers(userList.slice(0, 4)) // Limitar a 4 usuarios como se solicitó
    }
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">Usuarios en Línea</h2>
      
      <div className="space-y-3">
        {users.map((user) => (
          <div key={user.id} className="flex items-center p-3 border border-gray-200 rounded-lg">
            <div className="flex-shrink-0">
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-blue-800 font-semibold">
                  {user.email.charAt(0).toUpperCase()}
                </span>
              </div>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-900">
                {user.email}
                {currentUser && user.id === currentUser.id && (
                  <span className="ml-2 text-xs text-blue-600">(Tú)</span>
                )}
              </p>
              <p className="text-xs text-gray-500">
                Última vez: {new Date(user.last_seen).toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}
        
        {users.length === 0 && (
          <div className="text-center py-4 text-gray-500">
            <p>No hay usuarios en línea</p>
          </div>
        )}
      </div>
    </div>
  )
}