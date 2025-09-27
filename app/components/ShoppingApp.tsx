'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { User, Session } from '@supabase/supabase-js'
import Auth from './Auth'
import ShoppingList from './ShoppingList'
import UserList from './UserList'
import ProductCatalog from './Catalogo'

export default function ShoppingApp() {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [activeView, setActiveView] = useState<'shopping' | 'catalog'>('shopping')

  useEffect(() => {
    setMounted(true)
    
    // Obtener sesión activa
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    }
    getSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)
        if (event === 'SIGNED_OUT') {
          setUser(null)
          setSession(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Error al cerrar sesión:', error)
    } else {
      setUser(null)
      setSession(null)
    }
  }

  if (!mounted || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <main className="container mx-auto px-4 py-8 max-w-6xl">
      <header className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
      
        {user && (
          <div className="flex items-center space-x-4">
            <span className="text-gray-600 hidden md:inline">Hola, {user.email}</span>
            <button
              onClick={() => supabase.auth.signOut()}
              className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg transition-colors flex items-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
              </svg>
              Cerrar sesión
            </button>
          </div>
        )}
      </header>

      {!user ? (
        <div className="max-w-md mx-auto bg-white p-6 rounded-xl shadow-md border border-gray-100">
          <Auth />
        </div>
      ) : (
        <>
          {/* Navegación entre vistas */}
          <div className="flex space-x-2 mb-6 bg-white p-2 rounded-lg border border-gray-200 w-fit">
            <button
              onClick={() => setActiveView('shopping')}
              className={`px-4 py-2 rounded-md transition-colors ${
                activeView === 'shopping'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Lista de Compras
            </button>
            <button
              onClick={() => setActiveView('catalog')}
              className={`px-4 py-2 rounded-md transition-colors ${
                activeView === 'catalog'
                  ? 'bg-green-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Catálogo de Productos
            </button>
          </div>

          {activeView === 'shopping' ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2">
                <ShoppingList user={user} />
              </div>
              <div>
                <UserList />
              </div>
            </div>
          ) : (
            <ProductCatalog user={user} />
          )}
        </>
      )}
    </main>
  )
}