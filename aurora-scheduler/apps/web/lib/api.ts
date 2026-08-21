import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

// Attach JWT token from localStorage
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = localStorage.getItem("refresh_token");
        const userId = localStorage.getItem("user_id");
        if (refreshToken && userId) {
          const { data } = await axios.post(`${API_BASE}/auth/refresh`, {
            userId,
            refreshToken,
          });
          localStorage.setItem("access_token", data.accessToken);
          localStorage.setItem("refresh_token", data.refreshToken);
          original.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(original);
        }
      } catch {
        // Refresh failed — redirect to login
        if (typeof window !== "undefined") {
          localStorage.clear();
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(err);
  }
);

// ─── API helpers ────────────────────────────────────────────────────────────

export const authApi = {
  register: (email: string, password: string) =>
    api.post("/auth/register", { email, password }),
  login: (email: string, password: string) =>
    api.post("/auth/login", { email, password }),
  me: () => api.get("/auth/me"),
};

export const orgsApi = {
  create: (name: string) => api.post("/organizations", { name }),
  list: () => api.get("/organizations"),
  get: (id: string) => api.get(`/organizations/${id}`),
};

export const projectsApi = {
  create: (orgId: string, name: string) =>
    api.post("/projects", { orgId, name }),
  list: (orgId: string) => api.get(`/projects?orgId=${orgId}`),
  get: (id: string) => api.get(`/projects/${id}`),
  generateApiKey: (projectId: string, name?: string) =>
    api.post(`/projects/${projectId}/api-keys`, { name }),
  listApiKeys: (projectId: string) =>
    api.get(`/projects/${projectId}/api-keys`),
  revokeApiKey: (projectId: string, keyId: string) =>
    api.delete(`/projects/${projectId}/api-keys/${keyId}`),
};

export const queuesApi = {
  create: (data: any) => api.post("/queues", data),
  list: (projectId: string) => api.get(`/queues?projectId=${projectId}`),
  get: (id: string) => api.get(`/queues/${id}`),
  update: (id: string, data: any) => api.patch(`/queues/${id}`, data),
  pause: (id: string) => api.post(`/queues/${id}/pause`),
  resume: (id: string) => api.post(`/queues/${id}/resume`),
  stats: (id: string) => api.get(`/queues/${id}/stats`),
};

export const jobsApi = {
  create: (data: any) => api.post("/jobs", data),
  list: (params: Record<string, any>) =>
    api.get("/jobs", { params }),
  get: (id: string) => api.get(`/jobs/${id}`),
  cancel: (id: string) => api.post(`/jobs/${id}/cancel`),
  retry: (id: string) => api.post(`/jobs/${id}/retry`),
  logs: (jobId: string, executionId: string) =>
    api.get(`/jobs/${jobId}/executions/${executionId}/logs`),
};

export const workersApi = {
  list: () => api.get("/workers"),
  get: (id: string) => api.get(`/workers/${id}`),
  heartbeats: (id: string) => api.get(`/workers/${id}/heartbeats`),
};

export const dlqApi = {
  list: (params?: Record<string, any>) => api.get("/dlq", { params }),
  requeue: (id: string) => api.post(`/dlq/${id}/requeue`),
  purge: (id: string) => api.delete(`/dlq/${id}`),
};
