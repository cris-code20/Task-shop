'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { User } from '@supabase/supabase-js'

interface OnlineUser {
  id: string
  email: string
  presence_ref: string
  online_at: string
}

export default function UserList() {
  const [users, setUsers] = useState<OnlineUser[]>([])
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [mounted, setMounted] = useState(false)
  const [channel, setChannel] = useState<any>(null)

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
            const newState = presenceChannel.presenceState()
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

    return () => {
      if (channel) {
        channel.unsubscribe()
      }
    }
  }, [])

  const updateOnlineUsers = (presenceState: any) => {
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
  }

  if (!mounted) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center">
                <div className="h-10 w-10 rounded-full bg-gray-200 mr-3"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2 mt-2"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
      <h2 className="text-xl font-semibold mb-6 text-gray-800 flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
          <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
        </svg>
        Usuarios en Línea ({users.length})
      </h2>
      
      <div className="space-y-4">
        {users.map((user) => (
          <div key={user.id} className="flex items-center p-3 border border-gray-200 rounded-lg bg-gray-50">
            <div className="flex-shrink-0">
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-blue-800 font-semibold">
                  {user.email?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-900">
                {user.email || 'Usuario sin email'}
                {currentUser && user.id === currentUser.id && (
                  <span className="ml-2 text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">(Tú)</span>
                )}
              </p>
              <p className="text-xs text-gray-500">
                En línea • {new Date(user.online_at).toLocaleTimeString()}
              </p>
            </div>
            <div className="ml-auto h-3 w-3 rounded-full bg-green-500" title="En línea"></div>
          </div>
        ))}
        
        {users.length === 0 && (
          <div className="text-center py-4 text-gray-500">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p>Conectando...</p>
          </div>
        )}
      </div>
    </div>
  )
}