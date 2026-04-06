export interface AuthUser {
  id: number;
  username: string;
  role?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
  remember_me: boolean;
}

export interface AuthErrorResponse {
  detail?: string;
}

export interface LoginPageProps {
  onLoginSuccess?: (user: AuthUser, rememberMe: boolean) => void;
}