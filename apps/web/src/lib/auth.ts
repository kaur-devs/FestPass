import type {
  CurrentUser,
  ForgotPasswordInput,
  ResetPasswordInput,
  SignInInput,
  SignUpInput,
} from '@festpass/shared';
import { useQuery } from '@tanstack/react-query';
import { API_URL, apiCommand, apiJson } from './api';

interface UserResponse {
  user: CurrentUser;
}

export const currentUserKey = ['current-user'] as const;

export const googleSignInUrl = `${API_URL}/auth/google`;

export const authApi = {
  signUp: (input: SignUpInput) =>
    apiJson<UserResponse>('/auth/sign-up', { method: 'POST', body: input }),
  signIn: (input: SignInInput) =>
    apiJson<UserResponse>('/auth/sign-in', { method: 'POST', body: input }),
  signOut: () => apiCommand('/auth/sign-out'),
  signOutEverywhere: () => apiCommand('/auth/sign-out-everywhere'),
  forgotPassword: (input: ForgotPasswordInput) =>
    apiCommand('/auth/forgot-password', { body: input }),
  resetPassword: (input: ResetPasswordInput) => apiCommand('/auth/reset-password', { body: input }),
  verifyEmail: (token: string) => apiCommand('/auth/verify-email', { body: { token } }),
  resendVerification: () => apiCommand('/auth/verification-email'),
  me: () => apiJson<UserResponse>('/me'),
};

export function useCurrentUser() {
  return useQuery({
    queryKey: currentUserKey,
    queryFn: async () => (await authApi.me()).user,
    retry: false,
  });
}

export function safeRedirectPath(value: string | string[] | undefined, fallback = '/account') {
  const path = Array.isArray(value) ? value[0] : value;
  if (!path?.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return fallback;
  return path;
}
