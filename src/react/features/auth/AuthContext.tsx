import {
  createContext,
  useContext,
  useEffect,
  useState,
  useTransition,
  type PropsWithChildren,
} from 'react';
import {
  getAuthSnapshot,
  loginWithEmailPassword,
  loginWithGoogleForReact,
  registerWithEmail,
  sendPasswordReset,
  signOut,
  subscribeToAuth,
} from './authClient';

type AuthUser = ReturnType<typeof getAuthSnapshot>['user'];
type AuthProfile = ReturnType<typeof getAuthSnapshot>['profile'];

type AuthContextValue = {
  user: AuthUser;
  profile: AuthProfile;
  isReady: boolean;
  isPending: boolean;
  loginWithEmailPassword: (email: string, password: string) => Promise<AuthUser>;
  loginWithGoogleAccount: () => Promise<unknown>;
  registerWithEmail: (email: string, password: string, name: string) => Promise<AuthUser>;
  sendPasswordReset: (email: string) => Promise<boolean>;
  signOut: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser>(() => getAuthSnapshot().user);
  const [profile, setProfile] = useState<AuthProfile>(() => getAuthSnapshot().profile);
  const [isReady, setIsReady] = useState(Boolean(getAuthSnapshot().user || getAuthSnapshot().profile));
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const unsubscribe = subscribeToAuth((nextUser, nextProfile) => {
      startTransition(() => {
        setUser(nextUser);
        setProfile(nextProfile);
        setIsReady(true);
      });
    });
    return () => unsubscribe?.();
  }, []);

  const value: AuthContextValue = {
    user,
    profile,
    isReady,
    isPending,
    loginWithEmailPassword,
    loginWithGoogleAccount: loginWithGoogleForReact,
    registerWithEmail,
    sendPasswordReset,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider.');
  }

  return context;
}
