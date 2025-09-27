'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { User } from '@supabase/supabase-js'
import { RealtimeChannel } from '@supabase/supabase-js'

interface OnlineUser {
  id: string
  email: string
  presence_ref: string
  online_at: string
}

// Tipos para el estado de presencia
interface PresenceState {
  [key: string]: Array<{
    user_id: string
    email: string
    online_at: string
  }>
}

export default function UserList() {
  const [users, setUsers] = useState<OnlineUser[]>([])
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [mounted, setMounted] = useState(false)
  const [channel, setChannel] = useState<RealtimeChannel | null>(null)

  // Función para actualizar usuarios online (memoizada para evitar recreaciones)
  const updateOnlineUsers = useCallback((presenceState: PresenceState) => {
    const onlineUsers: OnlineUser[] = []
    
    for (const user_id in presenceState) {
      const presences = presenceState[user_id]
      if (presences.length > 0) {
        const presence = presences[0]
        onlineUsers.push({
          id: presence.user_id,
          email: presence.email,
          presence_ref: user_id,
          online_at: presence.online_at
        })
      }
    }
    
    setUsers(onlineUsers)
  }, [])

  useEffect(() => {
    setMounted(true)
    
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUser(user)
      
      if (user) {
        // Crear canal de presencia
        const presenceChannel = supabase.channel('online_users', {
          config: {
            presence: {
              key: user.id,
            },
          },
        })

        presenceChannel
          .on('presence', { event: 'sync' }, () => {
            const newState = presenceChannel.presenceState() as PresenceState
            console.log('sync', newState)
            updateOnlineUsers(newState)
          })
          .on('presence', { event: 'join' }, ({ key, newPresences }) => {
            console.log('join', key, newPresences)
          })
          .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
            console.log('leave', key, leftPresences)
          })
          .subscribe(async (status) => {
            if (status !== 'SUBSCRIBED') { return }

            // Enviar presencia del usuario actual
            await presenceChannel.track({
              user_id: user.id,
              email: user.email,
              online_at: new Date().toISOString(),
            })
          })

        setChannel(presenceChannel)
      }
    }
    
    getCurrentUser()

    // Cleanup function
    return () => {
      if (channel) {
        channel.unsubscribe()
      }
    }
  }, [updateOnlineUsers]) // Agregamos updateOnlineUsers como dependencia

  // Cleanup effect separado para el canal cuando cambia
  useEffect(() => {
    return () => {
      if (channel) {
        channel.unsubscribe()
      }
    }
  }, [channel])

  if (!mounted) {
    return (
      <div className="bg-gradient-to-br from-white via-gray-50/30 to-blue-50/20 rounded-3xl shadow-2xl border border-white/60 backdrop-blur-sm overflow-hidden">
        <div className="p-6 lg:p-8">
          <div className="animate-pulse">
            <div className="h-7 bg-gradient-to-r from-gray-200 to-gray-100 rounded-lg w-2/3 mb-6"></div>
            <div className="space-y-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex items-center p-4 bg-gray-100/50 rounded-xl">
                  <div className="h-12 w-12 rounded-full bg-gray-200 mr-4"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 rounded-lg w-3/4 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                  <div className="h-3 w-3 rounded-full bg-gray-200"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-white via-gray-50/30 to-blue-50/20 rounded-3xl shadow-2xl border border-white/60 backdrop-blur-sm overflow-hidden">
      {/* Header mejorado */}
      <div className="relative bg-gradient-to-r from-blue-600/5 to-indigo-600/5 border-b border-white/30 p-6 lg:p-8">
        <div className="flex items-center">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-br from-green-400 to-emerald-600 rounded-2xl blur-md opacity-70"></div>
            <div className="relative bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-3 shadow-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
              </svg>
            </div>
          </div>
          <div className="ml-4">
            <h2 className="text-xl lg:text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
              Usuarios en Línea
            </h2>
            <div className="flex items-center mt-1">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse mr-2"></div>
              <span className="text-sm text-gray-600">{users.length} conectados</span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="p-6 lg:p-8">
        <div className="space-y-3">
          {users.map((user, index) => (
            <div 
              key={user.id} 
              className="group relative overflow-hidden bg-gradient-to-r from-white/90 to-gray-50/50 border border-gray-200/60 rounded-2xl p-4 transition-all duration-300 transform hover:-translate-y-1 hover:shadow-lg"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out"></div>
              
              <div className="relative flex items-center">
                <div className="flex-shrink-0">
                  <div className="relative">
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center shadow-md">
                      <span className="text-blue-800 font-bold text-lg">
                        {user.email?.charAt(0).toUpperCase() || 'U'}
                      </span>
                    </div>
                    {/* Indicador de online */}
                    <div className="absolute -bottom-1 -right-1 h-4 w-4 bg-green-500 rounded-full border-2 border-white shadow-lg">
                      <div className="h-full w-full bg-green-400 rounded-full animate-ping absolute"></div>
                      <div className="h-full w-full bg-green-500 rounded-full"></div>
                    </div>
                  </div>
                </div>
                
                <div className="ml-4 flex-1 min-w-0">
                  <div className="flex items-center">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {user.email || 'Usuario sin email'}
                    </p>
                    {currentUser && user.id === currentUser.id && (
                      <span className="ml-2 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        Tú
                      </span>
                    )}
                  </div>
                  <div className="flex items-center mt-1">
                    <div className="h-2 w-2 bg-green-400 rounded-full mr-2 animate-pulse"></div>
                    <p className="text-xs text-gray-600">
                      En línea • {new Date(user.online_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
          
          {users.length === 0 && (
            <div className="text-center py-12">
              <div className="relative">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-24 w-24 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full opacity-60"></div>
                </div>
                <div className="relative">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Conectando...</h3>
              <p className="text-gray-500">Buscando usuarios en línea</p>
              <div className="mt-4 flex justify-center">
                <div className="flex space-x-1">
                  <div className="h-2 w-2 bg-blue-400 rounded-full animate-bounce"></div>
                  <div className="h-2 w-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="h-2 w-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}