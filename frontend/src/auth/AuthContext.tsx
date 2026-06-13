import { createContext, useContext, useState, type ReactNode } from "react";
import { api, clearSession } from "@/lib/api";
import type { AuthResponse, SignupRequestResponse, User } from "@/lib/types";

interface AuthCtx {
  user: User | null;
  login: (identifier: string, password: string, remember?: boolean) => Promise<User>;
  signupRequest: (payload: SignupPayload) => Promise<SignupRequestResponse>;
  signupVerify: (email: string, code: string) => Promise<User>;
  signupResend: (email: string) => Promise<SignupRequestResponse>;
  setUser: (user: User) => void;
  logout: () => void;
}

export interface SignupPayload {
  company_name: string;
  username: string;
  email: string;
  full_name?: string;
  password: string;
  photo?: string | null;
}

const Ctx = createContext<AuthCtx>(null!);

function loadUser(): User | null {
  try {
    const raw = localStorage.getItem("user") ?? sessionStorage.getItem("user");
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function persist(data: AuthResponse, remember: boolean): User {
  // "Remember me" → localStorage (survives browser restart); otherwise sessionStorage.
  const store = remember ? localStorage : sessionStorage;
  const other = remember ? sessionStorage : localStorage;
  store.setItem("token", data.access_token);
  store.setItem("user", JSON.stringify(data.user));
  other.removeItem("token");
  other.removeItem("user");
  return data.user;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(loadUser);

  async function login(identifier: string, password: string, remember = true) {
    const { data } = await api.post<AuthResponse>("/auth/login", { identifier, password });
    const u = persist(data, remember);
    setUserState(u);
    return u;
  }

  async function signupRequest(payload: SignupPayload) {
    const { data } = await api.post<SignupRequestResponse>("/auth/signup/request", payload);
    return data;
  }

  async function signupVerify(email: string, code: string) {
    const { data } = await api.post<AuthResponse>("/auth/signup/verify", { email, code });
    const u = persist(data, true);
    setUserState(u);
    return u;
  }

  async function signupResend(email: string) {
    const { data } = await api.post<SignupRequestResponse>("/auth/signup/resend", { email });
    return data;
  }

  function setUser(u: User) {
    // Write back to whichever store currently holds the session.
    const store = localStorage.getItem("token") ? localStorage : sessionStorage;
    store.setItem("user", JSON.stringify(u));
    setUserState(u);
  }

  function logout() {
    clearSession();
    setUserState(null);
    window.location.href = "/welcome";
  }

  return (
    <Ctx.Provider value={{ user, login, signupRequest, signupVerify, signupResend, setUser, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
