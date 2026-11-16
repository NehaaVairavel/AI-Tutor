import api from './api';

export const authService = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/profile', data),
  changePassword: (data) => api.put('/auth/change-password', data),
};

export const examService = {
  getAll: (params) => api.get('/exams', { params }),
  getById: (id) => api.get(`/exams/${id}`),
  create: (data) => api.post('/exams', data),
  update: (id, data) => api.put(`/exams/${id}`, data),
  delete: (id) => api.delete(`/exams/${id}`),
};

export const subjectService = {
  getAll: (params) => api.get('/subjects', { params }),
  getById: (id) => api.get(`/subjects/${id}`),
  create: (data) => api.post('/subjects', data),
  update: (id, data) => api.put(`/subjects/${id}`, data),
  delete: (id) => api.delete(`/subjects/${id}`),
};

export const topicService = {
  getAll: (params) => api.get('/topics', { params }),
  getById: (id) => api.get(`/topics/${id}`),
  create: (data) => api.post('/topics', data),
  update: (id, data) => api.put(`/topics/${id}`, data),
  delete: (id) => api.delete(`/topics/${id}`),
};

export const questionService = {
  getAll: (params) => api.get('/questions', { params }),
  getById: (id) => api.get(`/questions/${id}`),
  create: (data) => api.post('/questions', data),
  update: (id, data) => api.put(`/questions/${id}`, data),
  delete: (id) => api.delete(`/questions/${id}`),
  approve: (id) => api.post(`/questions/${id}/approve`),
  // AI generation & stats (admin only)
  getStats: (params) => api.get('/questions/stats', { params }),
  generate: (data) => api.post('/questions/generate', data),
};

export const practiceService = {
  startSession:     (data)                 => api.post('/practice/start', data),
  submitSession:    (sessionId, data)      => api.post(`/practice/${sessionId}/submit`, data),
  getSessionResult: (sessionId)            => api.get(`/practice/${sessionId}/result`),
  getSessionReview: (sessionId)            => api.get(`/practice/${sessionId}/review`),
  explainQuestion:  (sessionId, qIndex)    => api.post(`/practice/${sessionId}/explain/${qIndex}`),
  getSessionQuestions: (sessionId)         => api.get(`/practice/${sessionId}/questions`),
  getMySessions:    (params)               => api.get('/practice/sessions/me', { params }),
  getMyMistakes:    (params)               => api.get('/practice/mistakes/me', { params }),
};

export const progressService = {
  getMyProgress: (params) => api.get('/progress/me', { params }),
};

export const analyticsService = {
  getDashboard: () => api.get('/analytics/dashboard'),
};

export const tutorService = {
  getSessions: () => api.get('/tutor/sessions'),
  createSession: (data) => api.post('/tutor/sessions', data),
  sendMessage: (sessionId, data) => api.post(`/tutor/sessions/${sessionId}/message`, data),
};

export const studyPlanService = {
  getCurrent: () => api.get('/study-plans/current'),
  generate: (data) => api.post('/study-plans/generate', data),
  completeSession: (planId, sessionId) => api.patch(`/study-plans/${planId}/sessions/${sessionId}/complete`),
};

export const mockTestService = {
  getAll: (params) => api.get('/mock-tests', { params }),
  getById: (id) => api.get(`/mock-tests/${id}`),
  // Attempt lifecycle
  startAttempt: (testId) => api.post(`/mock-tests/${testId}/start`),
  submitAttempt: (attemptId, data) => api.post(`/mock-tests/attempts/${attemptId}/submit`, data),
  getAttempt: (attemptId) => api.get(`/mock-tests/attempts/${attemptId}`),
  getMyAttempts: (params) => api.get('/mock-tests/attempts/me', { params }),
};

export const adminService = {
  getDashboard:        ()       => api.get('/admin/dashboard'),
  getOverview:         (params) => api.get('/admin/overview', { params }),
  getUsers:            (params) => api.get('/admin/users', { params }),
  getUser:             (id)     => api.get(`/admin/users/${id}`),
  getUserTopics:       (id)     => api.get(`/admin/users/${id}/topics`),
  getUserSessions:     (id, params) => api.get(`/admin/users/${id}/sessions`, { params }),
  getUserSessionReview:(userId, sessionId) => api.get(`/admin/users/${userId}/sessions/${sessionId}/review`),
  toggleUserStatus:    (id)     => api.patch(`/admin/users/${id}/status`),
  getExamsList:        ()       => api.get('/admin/exams-list'),
};
