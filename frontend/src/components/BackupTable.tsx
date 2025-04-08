import { useState, useRef } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:8080/api';

export default function BackupTable() {
    const [restoreStatus, setRestoreStatus] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Создание бэкапа
    const handleBackup = async () => {
        try {
            const response = await axios.get(`${API_URL}/backup`, {
                responseType: 'blob' // Важно для скачивания файла
            });

            // Создаем ссылку для скачивания
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `db_backup_${new Date().toISOString().split('T')[0]}.zip`);
            document.body.appendChild(link);
            link.click();
            link.remove();

            setRestoreStatus('Бэкап успешно создан!');
        } catch (error) {
            console.error('Ошибка при создании бэкапа:', error);
            setRestoreStatus('Ошибка создания бэкапа');
        }
    };

    // Восстановление из бэкапа
    const handleRestore = async () => {
        if (!fileInputRef.current?.files?.length) {
            setRestoreStatus('Выберите файл бэкапа');
            return;
        }

        const formData = new FormData();
        formData.append('backup', fileInputRef.current.files[0]);

        try {
            await axios.post(`${API_URL}/restore`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });
            setRestoreStatus('База успешно восстановлена!');
        } catch (error) {
            console.error('Ошибка при восстановлении:', error);
            setRestoreStatus('Ошибка восстановления');
        } finally {
            if (fileInputRef.current) {
                fileInputRef.current.value = ''; // Сброс выбора файла
            }
        }
    };

    return (
        <div className="backup-container">
            <h2>Backup & Restore</h2>

            <div className="backup-section">
                <button
                    onClick={handleBackup}
                    className="backup-button"
                >
                    Создать бэкап всей БД
                </button>
                <p>Скачает ZIP-архив со всеми таблицами</p>
            </div>

            <div className="restore-section">
                <h3>Восстановление из бэкапа</h3>
                <input
                    type="file"
                    ref={fileInputRef}
                    accept=".zip"
                    className="file-input"
                />
                <button
                    onClick={handleRestore}
                    className="restore-button"
                >
                    Восстановить БД
                </button>
                {restoreStatus && <div className="status">{restoreStatus}</div>}
            </div>

            <style>{`
        .backup-container {
          padding: 20px;
          max-width: 600px;
          margin: 0 auto;
          font-family: Arial;
        }
        .backup-section, .restore-section {
          margin-bottom: 30px;
          padding: 20px;
          border: 1px solid #ddd;
          border-radius: 8px;
        }
        .backup-button, .restore-button {
          padding: 10px 15px;
          background-color: #4CAF50;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          margin-right: 10px;
        }
        .restore-button {
          background-color: #2196F3;
        }
        .file-input {
          margin: 10px 0;
          display: block;
        }
        .status {
          margin-top: 10px;
          padding: 10px;
          background-color: #f8f8f8;
          border-radius: 4px;
        }
      `}</style>
        </div>
    );
}