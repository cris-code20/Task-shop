// app/components/ShoppingList.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { User, Session } from '@supabase/supabase-js'

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
  session: Session | null
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
        .order('created_at', { ascending: true })

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

    // Suscripción optimizada a cambios en tiempo real
     const channel = supabase
      .channel('shopping_list_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'shopping_lists',
        },
        (payload) => {
          // Optimización: Obtenemos el nuevo item con su relación de perfil
          supabase
            .from('shopping_lists')
            .select(`
              *,
              profiles:user_id (
                email
              )
            `)
            .eq('id', payload.new.id)
            .single()
            .then(({ data: newItem }) => {
              if (newItem) {
                setItems(prevItems => [newItem, ...prevItems])
                setLastUpdate(new Date())
              }
            })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'shopping_lists',
        },
        (payload) => {
          // Actualizamos solo el item modificado
          setItems(prevItems => 
            prevItems.map(item => 
              item.id === payload.new.id ? { ...item, ...payload.new } : item
            )
          )
          setLastUpdate(new Date())
          // Remover el ID de la lista de actualización
          setUpdatingItems(prev => prev.filter(id => id !== payload.new.id))
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'shopping_lists',
        },
        (payload) => {
          // Eliminamos solo el item borrado
          setItems(prevItems => 
            prevItems.filter(item => item.id !== payload.old.id)
          )
          setLastUpdate(new Date())
          // Remover el ID de la lista de eliminación
          setDeletingItems(prev => prev.filter(id => id !== payload.old.id))
        }
      )
      .subscribe((status) => {
        console.log('Estado del canal de suscripción:', status)
      })

    // Polling como respaldo: actualizar cada 5 segundos
    const interval = setInterval(() => {
      fetchItems();
    }, 5000);

     return () => {
      supabase.removeChannel(channel)
      clearInterval(interval);
    }
  }, [fetchItems])

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
      }
    } catch (error) {
      console.error('Error in addItem:', error)
      alert('Error al añadir el artículo')
    } finally {
      setAddingItem(false)
    }
  }

  const updateItem = async (id: number, updates: Partial<ShoppingItem>) => {
    setUpdatingItems(prev => [...prev, id])
    try {
      const { error } = await supabase
        .from('shopping_lists')
        .update(updates)
        .eq('id', id)

      if (error) {
        console.error('Error updating item:', error)
        setUpdatingItems(prev => prev.filter(itemId => itemId !== id))
      }
    } catch (error) {
      console.error('Error in updateItem:', error)
      setUpdatingItems(prev => prev.filter(itemId => itemId !== id))
    }
  }

  const deleteItem = async (id: number) => {
    setDeletingItems(prev => [...prev, id])
    try {
      const { error } = await supabase
        .from('shopping_lists')
        .delete()
        .eq('id', id)

      if (error) {
        console.error('Error deleting item:', error)
        setDeletingItems(prev => prev.filter(itemId => itemId !== id))
      }
    } catch (error) {
      console.error('Error in deleteItem:', error)
      setDeletingItems(prev => prev.filter(itemId => itemId !== id))
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
    <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Lista de Compras
        </h2>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-500">
            Última actualización: {lastUpdate.toLocaleTimeString()}
          </span>
          <button
            onClick={forceRefresh}
            className="text-gray-500 hover:text-gray-700 p-1 transition-colors"
            title="Forzar actualización"
            disabled={loading}
          >
            {loading ? (
              <svg className="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        </div>
      </div>
      
      <form onSubmit={addItem} className="mb-8 bg-blue-50 p-5 rounded-xl">
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="¿Qué necesitas comprar?"
            className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            required
            disabled={addingItem}
          />
          <input
            type="text"
            value={newQuantity}
            onChange={(e) => setNewQuantity(e.target.value)}
            placeholder="Cantidad"
            className="w-full sm:w-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            disabled={addingItem}
          />
        </div>
        <button 
          type="submit" 
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-3 rounded-lg transition-colors flex items-center justify-center w-full disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={addingItem}
        >
          {addingItem ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Añadiendo...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Añadir artículo
            </>
          )}
        </button>
      </form>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse flex items-center justify-between p-5 border rounded-xl bg-gray-100">
              <div className="flex items-center space-x-4">
                <div className="h-6 w-6 rounded-full bg-gray-300"></div>
                <div className="flex-1">
                  <div className="h-5 bg-gray-300 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-300 rounded w-1/2 mt-2"></div>
                </div>
              </div>
              <div className="h-5 w-5 bg-gray-300 rounded"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const isUpdating = updatingItems.includes(item.id)
            const isDeleting = deletingItems.includes(item.id)
            const isProcessing = isUpdating || isDeleting
            
            return (
              <div key={item.id} className={`flex items-center justify-between p-5 border rounded-xl transition-all duration-200 ${item.completed ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'} ${isProcessing ? 'opacity-70' : 'hover:shadow-md'}`}>
                <div className="flex items-center space-x-4">
                  <button
                    onClick={() => !isProcessing && updateItem(item.id, { completed: !item.completed })}
                    className={`h-6 w-6 rounded-full flex items-center justify-center transition-colors ${item.completed ? 'bg-green-500' : 'border-2 border-gray-300'} ${isProcessing ? 'cursor-not-allowed opacity-50' : ''}`}
                    title={item.completed ? 'Marcar como pendiente' : 'Marcar como completado'}
                    disabled={isProcessing}
                  >
                    {isUpdating ? (
                      <svg className="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : item.completed ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : null}
                  </button>
                  <div className="flex-1">
                    <span className={`block text-lg ${item.completed ? 'line-through text-gray-500' : 'text-gray-800'}`}>
                      {item.item} {item.quantity && <span className="text-blue-600 font-medium">({item.quantity})</span>}
                      {isProcessing && (
                        <span className="ml-2 text-xs text-blue-500">
                          {isUpdating ? 'Actualizando...' : 'Eliminando...'}
                        </span>
                      )}
                    </span>
                    <span className="text-sm text-gray-500 block mt-1">
                      Añadido por: {item.profiles?.email || item.user_id}
                    </span>
                  </div>
                </div>
                
                {item.user_id === user.id && (
                  <button
                    onClick={() => !isProcessing && deleteItem(item.id)}
                    className="text-red-500 hover:text-red-700 p-2 transition-colors rounded-full hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Eliminar artículo"
                    disabled={isProcessing}
                  >
                    {isDeleting ? (
                      <svg className="animate-spin h-5 w-5 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            )
          })}
          
          {items.length === 0 && (
            <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              <p className="text-xl font-medium mb-2">La lista está vacía</p>
              <p className="text-sm">¡Añade algunos productos para comenzar!</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}