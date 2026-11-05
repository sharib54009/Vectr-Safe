import { post, request } from './client.js'

export const getCurrentUser = () => request('/api/auth/me/')
export const signUp = data => post('/api/auth/signup/', data)
export const logIn = data => post('/api/auth/login/', data)
export const logOut = () => post('/api/auth/logout/', {})
