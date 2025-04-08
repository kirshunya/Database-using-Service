import axios from "axios";

const apiUrl = "http://localhost:8081"; // Замените на ваш серверный URL

export const createTable = async (sql: string) => {
    const response = await axios.post(`${apiUrl}/create`, { sql });
    return response.data;
};

export const dropTable = async (name: string) => {
    const response = await axios.post(`${apiUrl}/drop`, { name });
    return response.data;
};

export const backupTable = async (name: string) => {
    const response = await axios.post(`${apiUrl}/backup`, { name });
    return response.data;
};

export const runQuery = async (sql: string) => {
    const response = await axios.post(`${apiUrl}/run-query`, { sql });
    return response.data;
};

export const exportTable = async (table: string) => {
    const response = await axios.get(`${apiUrl}/export`, { params: { table } });
    return response.data;
};
