import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:8081/api', // URL твоего Gin-бэкенда
});

// Перехватчик для ошибок
api.interceptors.response.use(
    (response) => response,
    (error) => {
        console.error('API Error:', error.response?.data || error.message);
        return Promise.reject(error);
    }
);

export default api;