import React, { createContext, useContext, useEffect, useState } from "react";
import { 
  auth,
  USE_LOCAL_MOCK
} from "../firebase";
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  GoogleAuthProvider, 
  signInWithPopup 
} from "firebase/auth";

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  function signup(email, password) {
    if (USE_LOCAL_MOCK) {
      const user = { uid: "local-user-id", email, displayName: email.split("@")[0] };
      localStorage.setItem("mockUser", JSON.stringify(user));
      setCurrentUser(user);
      return Promise.resolve(user);
    }
    return createUserWithEmailAndPassword(auth, email, password);
  }

  function login(email, password) {
    if (USE_LOCAL_MOCK) {
      const user = { uid: "local-user-id", email, displayName: email.split("@")[0] };
      localStorage.setItem("mockUser", JSON.stringify(user));
      setCurrentUser(user);
      return Promise.resolve(user);
    }
    return signInWithEmailAndPassword(auth, email, password);
  }

  function logout() {
    if (USE_LOCAL_MOCK) {
      localStorage.removeItem("mockUser");
      setCurrentUser(null);
      return Promise.resolve();
    }
    return signOut(auth);
  }

  function loginWithGoogle() {
    if (USE_LOCAL_MOCK) {
      const user = { uid: "local-user-id", email: "guest@podmind.ai", displayName: "Guest User" };
      localStorage.setItem("mockUser", JSON.stringify(user));
      setCurrentUser(user);
      return Promise.resolve(user);
    }
    const provider = new GoogleAuthProvider();
    return signInWithPopup(auth, provider);
  }

  useEffect(() => {
    if (USE_LOCAL_MOCK) {
      const savedUser = localStorage.getItem("mockUser");
      if (savedUser) {
        setCurrentUser(JSON.parse(savedUser));
      }
      setLoading(false);
    } else {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        setCurrentUser(user);
        setLoading(false);
      });

      return unsubscribe;
    }
  }, []);

  const value = {
    currentUser,
    signup,
    login,
    logout,
    loginWithGoogle
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
