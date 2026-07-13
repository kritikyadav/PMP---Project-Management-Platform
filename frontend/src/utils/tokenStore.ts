let accessToken = typeof localStorage !== 'undefined' ? (localStorage.getItem('token') ?? '') : '';

export const tokenStore = {
  setToken(token: string): void {
    accessToken = token;
  },
  getToken(): string {
    return accessToken;
  },
  clearToken(): void {
    accessToken = '';
  }
};
