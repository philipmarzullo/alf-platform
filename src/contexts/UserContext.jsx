import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const { session } = useAuth();
  const [realUser, setRealUser] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [profileLoading, setProfileLoading] = useState(true);

  // Fetch current user's profile when session changes
  useEffect(() => {
    if (!session?.user?.id || !supabase) {
      setRealUser(null);
      setProfileLoading(false);
      return;
    }

    let cancelled = false;
    setProfileLoading(true);

    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Failed to fetch profile:', error);
          setRealUser(null);
        } else {
          setRealUser(data);
        }
        setProfileLoading(false);
      });

    return () => { cancelled = true; };
  }, [session?.user?.id]);

  // Fetch all users (for platform admin)
  const refreshUsers = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) {
      console.error('Failed to fetch users:', error);
    } else {
      setAllUsers(data);
    }
  }, []);

  useEffect(() => {
    if (realUser) {
      refreshUsers();
    } else {
      setAllUsers([]);
    }
  }, [realUser, refreshUsers]);

  const currentUser = realUser;

  const isPlatformOwner = currentUser?.role === 'platform_owner';
  const isSuperAdmin = currentUser?.role === 'super-admin' || isPlatformOwner;
  const isAdmin = currentUser?.role === 'admin' || isSuperAdmin;

  return (
    <UserContext.Provider
      value={{
        currentUser,
        realUser,
        allUsers,
        refreshUsers,
        isAdmin,
        isSuperAdmin,
        isPlatformOwner,
        profileLoading,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}
