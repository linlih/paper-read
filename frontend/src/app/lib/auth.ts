import { api } from './api';
import type { User } from '../components/types';

export function me() {
  return api<{ user: User }>('/api/me');
}

export function login(email: string, password: string) {
  return api<{ user: User }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function register(name: string, email: string, password: string) {
  return api<{ user: User }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });
}
