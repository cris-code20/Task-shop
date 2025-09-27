// app/components/ShoppingList.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { User } from '@supabase/supabase-js'

interface ShoppingItem {
  id: number
  created_at: string
  item: string
  quantity: string
  user_id: string
  completed: boolean
  profiles?: {
    email: string
  }
}

interface ShoppingListProps {
  user: User
}

export default function ShoppingList({ user }: ShoppingListProps) {
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [newItem, setNewItem] = useState('')
  const [newQuantity, setNewQuantity] = useState('')
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [addingItem, setAddingItem] = useState(false)
  const [updatingItems, setUpdatingItems] = useState<number[]>([])
  const [deletingItems, setDeletingItems] = useState<number[]>([])
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'polling'>('connected')

  // Función optimizada para obtener items
  const fetchItems = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('shopping_lists')
        .select(`
          *,
          profiles:user_id (
            email
          )
        `)
        .order('created_at', { ascending: false }) // Ordenar por más reciente primero

      if (error) {
        console.error('Error fetching items:', error)
      } else {
        setItems(data || [])
        setLastUpdate(new Date())
      }
    } catch (error) {
      console.error('Error in fetchItems:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setMounted(true)
    fetchItems()

    let channel: any = null
    let retryCount = 0
    const maxRetries = 3

    const setupRealtime = () => {
      channel = supabase
        .channel('shopping_list_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'shopping_lists',
          },
          (payload) => {
            console.log('Cambio recibido:', payload)
            setConnectionStatus('connected')
            retryCount = 0 // Resetear contador de reintentos
            
            if (payload.eventType === 'INSERT') {
              // Para inserciones, hacer fetch completo para obtener relaciones
              fetchItems()
            } else if (payload.eventType === 'UPDATE') {
              // Optimistic update para cambios rápidos
              setItems(prevItems => 
                prevItems.map(item => 
                  item.id === payload.new.id ? { ...item, ...payload.new } : item
                )
              )
            } else if (payload.eventType === 'DELETE') {
              // Optimistic delete
              setItems(prevItems => 
                prevItems.filter(item => item.id !== payload.old.id)
              )
            }
          }
        )
        .subscribe((status, err) => {
          console.log('Estado de suscripción:', status)
          if (status === 'SUBSCRIBED') {
            setConnectionStatus('connected')
            retryCount = 0
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setConnectionStatus('disconnected')
            if (retryCount < maxRetries) {
              retryCount++
              setTimeout(setupRealtime, 2000 * retryCount) // Reintentar con backoff
            }
          }
        })
    }

    setupRealtime()

    // Polling más agresivo como respaldo
    const interval = setInterval(() => {
      if (connectionStatus === 'disconnected') {
        setConnectionStatus('polling')
        fetchItems()
      }
    }, 2000) // Polling cada 2 segundos si hay problemas

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
      clearInterval(interval)
    }
  }, [fetchItems, connectionStatus])

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newItem.trim() || !user) return

    setAddingItem(true)
    try {
      const { error } = await supabase
        .from('shopping_lists')
        .insert([{ 
          item: newItem.trim(), 
          quantity: newQuantity.trim(),
          user_id: user.id 
        }])

      if (error) {
        console.error('Error adding item:', error)
        alert('Error al añadir el artículo: ' + error.message)
      } else {
        setNewItem('')
        setNewQuantity('')
        // Forzar actualización inmediata
        setTimeout(() => fetchItems(), 500)
      }
    } catch (error) {
      console.error('Error in addItem:', error)
      alert('Error al añadir el artículo')
    } finally {
      setAddingItem(false)
    }
  }

  const updateItem = async (id: number, updates: Partial<ShoppingItem>) => {
    // Optimistic update inmediato
    setItems(prevItems => 
      prevItems.map(item => 
        item.id === id ? { ...item, ...updates } : item
      )
    )
    
    setUpdatingItems(prev => [...prev, id])
    
    try {
      const { error } = await supabase
        .from('shopping_lists')
        .update(updates)
        .eq('id', id)

      if (error) {
        console.error('Error updating item:', error)
        // Revertir optimistic update si hay error
        setTimeout(() => fetchItems(), 500)
      }
    } catch (error) {
      console.error('Error in updateItem:', error)
      setTimeout(() => fetchItems(), 500)
    } finally {
      setTimeout(() => {
        setUpdatingItems(prev => prev.filter(itemId => itemId !== id))
      }, 1000)
    }
  }

  const deleteItem = async (id: number) => {
    // Optimistic delete inmediato
    const deletedItem = items.find(item => item.id === id)
    setItems(prevItems => prevItems.filter(item => item.id !== id))
    
    setDeletingItems(prev => [...prev, id])
    
    try {
      const { error } = await supabase
        .from('shopping_lists')
        .delete()
        .eq('id', id)

      if (error) {
        console.error('Error deleting item:', error)
        // Revertir optimistic delete si hay error
        if (deletedItem) {
          setItems(prevItems => [...prevItems, deletedItem].sort((a, b) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          ))
        }
      }
    } catch (error) {
      console.error('Error in deleteItem:', error)
      if (deletedItem) {
        setItems(prevItems => [...prevItems, deletedItem].sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ))
      }
    } finally {
      setTimeout(() => {
        setDeletingItems(prev => prev.filter(itemId => itemId !== id))
      }, 1000)
    }
  }

  // Forzar actualización manual
  const forceRefresh = () => {
    setLoading(true)
    fetchItems()
  }

  if (!mounted) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
        <div className="animate-pulse">
          <div className="h-7 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="h-12 bg-gray-200 rounded mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

 return (
  <div className="bg-gradient-to-br from-white via-blue-50/30 to-indigo-50/40 rounded-3xl shadow-2xl border border-white/60 backdrop-blur-sm overflow-hidden">
    {/* Header con diseño moderno */}
    <div className="relative bg-gradient-to-r from-blue-600/5 to-indigo-600/5 border-b border-white/30 p-6 lg:p-8">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div className="flex items-center">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-indigo-600 rounded-2xl blur-md opacity-70"></div>
            <div className="relative bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-3 shadow-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 lg:h-7 lg:w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
          </div>
          <div className="ml-4">
            <h2 className="text-2xl lg:text-3xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
              Lista de Compras
            </h2>
            <p className="text-sm text-gray-600 mt-1 hidden sm:block">Organiza tus compras en tiempo real</p>
          </div>
        </div>
        
        {/* Status mejorado y responsive */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
          <div className="flex items-center space-x-3 bg-white/70 backdrop-blur-sm rounded-full px-4 py-2 border border-white/40">
            <div className="flex items-center space-x-2">
              <div className={`h-2.5 w-2.5 rounded-full animate-pulse ${
                connectionStatus === 'connected' ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50' : 
                connectionStatus === 'polling' ? 'bg-amber-500 shadow-lg shadow-amber-500/50' : 'bg-red-500 shadow-lg shadow-red-500/50'
              }`}></div>
              <span className="text-xs font-medium text-gray-700">
                {connectionStatus === 'connected' ? 'En tiempo real' :
                 connectionStatus === 'polling' ? 'Sincronizando...' : 'Desconectado'}
              </span>
            </div>
            <div className="h-4 w-px bg-gray-300"></div>
            <span className="text-xs text-gray-600 font-mono">
              {lastUpdate.toLocaleTimeString()}
            </span>
          </div>
          
          <button
            onClick={forceRefresh}
            className="group relative bg-white/80 hover:bg-white border border-white/60 hover:border-blue-200 text-gray-600 hover:text-blue-600 p-3 rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            title="Forzar actualización"
            disabled={loading}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-blue-400/0 via-blue-400/0 to-blue-400/0 group-hover:from-blue-400/10 group-hover:via-blue-400/5 group-hover:to-blue-400/10 rounded-xl transition-all duration-300"></div>
            {loading ? (
              <svg className="animate-spin h-5 w-5 text-blue-500 relative z-10" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 relative z-10 group-hover:rotate-180 transition-transform duration-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
    
    {/* Formulario mejorado */}
    <div className="p-6 lg:p-8">
      <form onSubmit={addItem} className="mb-8">
        <div className="relative bg-gradient-to-br from-blue-50 via-indigo-50/50 to-purple-50/30 rounded-2xl p-6 border border-blue-100/60 shadow-inner">
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="relative flex-1">
              <input
                type="text"
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                placeholder="¿Qué necesitas comprar?"
                className="w-full p-4 pr-12 border border-gray-200 rounded-xl bg-white/80 backdrop-blur-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:bg-white transition-all duration-300 placeholder-gray-400 text-gray-800 shadow-sm"
                required
                disabled={addingItem}
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
          </div>
          
          <button 
            type="submit" 
            className="group relative w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold px-6 py-4 rounded-xl transition-all duration-300 flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            disabled={addingItem}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/0 to-white/0 group-hover:from-white/10 group-hover:via-white/5 group-hover:to-white/10 rounded-xl transition-all duration-300"></div>
            {addingItem ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white relative z-10" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="relative z-10">Añadiendo...</span>
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3 relative z-10 group-hover:scale-110 transition-transform duration-300" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                <span className="relative z-10">Añadir artículo</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Lista de items mejorada */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse bg-gradient-to-r from-gray-100 to-gray-50 rounded-2xl p-6 border border-gray-100">
              <div className="flex items-center space-x-4">
                <div className="h-7 w-7 rounded-full bg-gray-200"></div>
                <div className="flex-1">
                  <div className="h-5 bg-gray-200 rounded-lg w-3/4 mb-3"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </div>
                <div className="h-6 w-6 bg-gray-200 rounded-lg"></div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => {
            const isUpdating = updatingItems.includes(item.id)
            const isDeleting = deletingItems.includes(item.id)
            const isProcessing = isUpdating || isDeleting
            
            return (
              <div 
                key={item.id} 
                className={`group relative overflow-hidden rounded-2xl border backdrop-blur-sm transition-all duration-300 transform hover:-translate-y-1 ${
                  item.completed 
                    ? 'bg-gradient-to-r from-emerald-50/80 to-green-50/60 border-emerald-200/60 shadow-sm hover:shadow-lg hover:shadow-emerald-100/50' 
                    : 'bg-gradient-to-r from-white/90 to-gray-50/50 border-gray-200/60 shadow-sm hover:shadow-xl hover:shadow-gray-100/80'
                } ${isProcessing ? 'opacity-70 transform-none hover:transform-none' : ''}`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out"></div>
                
                <div className="relative p-5 lg:p-6">
                  <div className="flex items-center space-x-4">
                    <button
                      onClick={() => !isProcessing && updateItem(item.id, { completed: !item.completed })}
                      className={`relative h-7 w-7 lg:h-8 lg:w-8 rounded-full flex items-center justify-center transition-all duration-300 transform hover:scale-110 ${
                        item.completed 
                          ? 'bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/30' 
                          : 'border-2 border-gray-300 hover:border-blue-400 bg-white shadow-sm hover:shadow-md'
                      } ${isProcessing ? 'cursor-not-allowed opacity-50 transform-none hover:scale-100' : ''}`}
                      title={item.completed ? 'Marcar como pendiente' : 'Marcar como completado'}
                      disabled={isProcessing}
                    >
                      {isUpdating ? (
                        <svg className="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : item.completed ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 lg:h-5 lg:w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : null}
                    </button>
                    
                    <div className="flex-1 min-w-0">
                      <div className={`text-base lg:text-lg font-medium transition-all duration-300 ${
                        item.completed 
                          ? 'line-through text-gray-500' 
                          : 'text-gray-800'
                      }`}>
                        <span className="break-words">{item.item}</span>
                        {item.quantity && (
                          <span className="ml-2 inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                            {item.quantity}
                          </span>
                        )}
                        {isProcessing && (
                          <span className="ml-3 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-600 animate-pulse">
                            {isUpdating ? 'Actualizando...' : 'Eliminando...'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center mt-2 text-sm text-gray-500">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span className="truncate">
                          Añadido por: {item.profiles?.email || item.user_id}
                        </span>
                      </div>
                    </div>
                    
                    {item.user_id === user.id && (
                      <button
                        onClick={() => !isProcessing && deleteItem(item.id)}
                        className="group/btn relative p-2.5 lg:p-3 text-gray-400 hover:text-red-500 transition-all duration-300 rounded-xl hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-110"
                        title="Eliminar artículo"
                        disabled={isProcessing}
                      >
                        <div className="absolute inset-0 bg-red-500/0 group-hover/btn:bg-red-500/10 rounded-xl transition-colors duration-300"></div>
                        {isDeleting ? (
                          <svg className="animate-spin h-5 w-5 text-red-500 relative z-10" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 relative z-10" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          
          {items.length === 0 && (
            <div className="text-center py-16 px-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-32 w-32 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full opacity-60"></div>
                </div>
                <div className="relative">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 mx-auto text-gray-400 mb-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-700 mb-3">Lista vacía</h3>
              <p className="text-gray-500 text-lg mb-4">¡Añade algunos productos para comenzar!</p>
              <div className="inline-flex items-center px-4 py-2 rounded-full bg-blue-50 text-blue-600 text-sm font-medium">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                Usa el formulario de arriba
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  </div>
)
}