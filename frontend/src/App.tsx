import { useState, useEffect, useCallback } from 'react';
import axios, { AxiosError } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { ColumnDefinition, TableDefinition } from './types.ts';
import TableManager from "./components/TableManager.tsx";

const API_URL = 'http://localhost:8081/api';

// Типы данных для колонок
const COLUMN_TYPES = [
    'INTEGER', 'SERIAL', 'VARCHAR(255)', 'TEXT', 'BOOLEAN',
    'DATE', 'TIMESTAMP', 'FLOAT', 'JSON', 'UUID'
] as const;


interface ApiError {
    error?: string;
    message?: string;
}

interface SavedQuery {
    id: number; // Теперь точно число
    query: string;
    name: string;
    lastUsed: string;
    useCount: number;
}

type TabType = 'tables' | 'queries' | 'backup' | 'table-manager';

function App() {
    const [tables, setTables] = useState<string[]>([]);
    const [newTable, setNewTable] = useState<TableDefinition>({
        name: '',
        columns: [{ id: uuidv4(), name: '', type: 'VARCHAR(255)' }] // Добавляем уникальный id для каждой колонки
    });

    const [activeTab, setActiveTab] = useState<TabType>('tables');

    const [currentQuery, setCurrentQuery] = useState<string>('SELECT * FROM employees');
    const [queryResults, setQueryResults] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
    const [queryName, setQueryName] = useState<string>('');

    const [backupFile, setBackupFile] = useState<File | null>(null);
    const [tableBackupFile, setTableBackupFile] = useState<File | null>(null);
    const [selectedTableForBackup, setSelectedTableForBackup] = useState<string>('');
    const [rowId, setRowId] = useState<string>('');

    const [isLoading, setIsLoading] = useState({
        tables: false,
        queries: false,
        backup: false,
        execution: false
    });

    // Загрузка данных
    useEffect(() => {
        fetchTables();
        fetchSavedQueries();
    }, []);

    const fetchTables = useCallback(async () => {
        setIsLoading(prev => ({ ...prev, tables: true }));
        try {
            const { data } = await axios.get<string[]>(`${API_URL}/tables`);
            setTables(data);
            setError(null);
        } catch (err) {
            handleApiError(err, 'Ошибка загрузки таблиц');
        } finally {
            setIsLoading(prev => ({ ...prev, tables: false }));
        }
    }, []);

    const fetchSavedQueries = useCallback(async () => {
        setIsLoading(prev => ({ ...prev, queries: true }));
        try {
            const { data } = await axios.get<SavedQuery[]>(`${API_URL}/queries/history`);

            setSavedQueries(data.map(q => ({
                id: q.id,
                query: q.query,
                name: q.name || 'Unnamed query',
                lastUsed: q.lastUsed,
                useCount: q.useCount || 0
            })));

        } catch (err) {
            handleApiError(err, 'Ошибка загрузки истории запросов');
        } finally {
            setIsLoading(prev => ({ ...prev, queries: false }));
        }
    }, []);

    const handleApiError = (err: unknown, defaultMessage: string) => {
        const error = err as AxiosError<ApiError>;
        setError(error.response?.data?.error || error.response?.data?.message || defaultMessage);
        console.error(error);
    };

    // const handleTableRestore = async () => {
    //     if (!selectedTableForBackup || !tableBackupFile) return;
    //
    //     setIsLoading(prev => ({ ...prev, backup: true }));
    //     const formData = new FormData();
    //     formData.append('file', tableBackupFile);
    //
    //     try {
    //         const response = await axios.post(
    //             `${API_URL}/tables/${selectedTableForBackup}/restore`,
    //             formData,
    //             {
    //                 headers: {
    //                     'Content-Type': 'multipart/form-data'
    //                 }
    //             }
    //         );
    //
    //         alert(response.data.status || 'Таблица успешно восстановлена');
    //         setError(null);
    //         // Обновляем данные таблицы
    //         fetchTables();
    //     } catch (err) {
    //         if (err.response?.status === 404) {
    //             setError(`Таблица "${selectedTableForBackup}" не найдена на сервере`);
    //         } else if (err.response?.data?.error) {
    //             setError(err.response.data.error);
    //         } else {
    //             setError('Ошибка при восстановлении таблицы');
    //         }
    //     } finally {
    //         setIsLoading(prev => ({ ...prev, backup: false }));
    //     }
    // };

    const deleteQuery = async (id: number) => {
        if (!confirm('Вы уверены, что хотите удалить этот запрос?')) return;

        try {
            await axios.delete(`${API_URL}/queries/${id}`);
            setSavedQueries(prev => prev.filter(q => q.id !== id));
        } catch (err) {
            handleApiError(err, 'Не удалось удалить запрос');
        }
    };

    const exportQueryResults = async (query: string) => {
        try {
            const response = await axios.post(
                `${API_URL}/export/query`,
                { query },
                { responseType: 'blob' }
            );

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'query_results.csv');
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            handleApiError(err, 'Ошибка экспорта данных');
        }
    };

    const handleFullBackup = async () => {
        setIsLoading(prev => ({ ...prev, backup: true }));
        try {
            const response = await axios.get(`${API_URL}/backup`, {
                responseType: 'blob',
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `db_backup_${new Date().toISOString()}.zip`);
            document.body.appendChild(link);
            link.click();
            link.remove();

            setError(null);
        } catch (err) {
            handleApiError(err, 'Ошибка создания бэкапа');
        } finally {
            setIsLoading(prev => ({ ...prev, backup: false }));
        }
    };

    const handleFullRestore = async () => {
        if (!backupFile) {
            setError('Выберите файл бэкапа');
            return;
        }

        // Добавляем проверку файла перед отправкой
        if (!backupFile.name.endsWith('.zip')) {
            setError('Только ZIP-архивы поддерживаются');
            return;
        }

        //setIsLoading(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append('db_backup', backupFile);

            // Добавляем заголовок и параметры явно
            const response = await axios.post(`${API_URL}/restore`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
                transformRequest: (data) => data, // Отключаем преобразование axios
                timeout: 60000, // Увеличиваем таймаут для больших файлов
            });

            alert(response.data.status || 'База успешно восстановлена!');
            window.location.reload();
        } catch (err) {
            if (axios.isAxiosError(err)) {
                // Используем сообщение об ошибке от сервера
                setError(err.response?.data?.error || 'Ошибка восстановления');

                // Логируем детали для отладки
                console.error('Детали ошибки:', {
                    status: err.response?.status,
                    data: err.response?.data,
                    headers: err.response?.headers,
                });
            } else {
                setError('Неизвестная ошибка');
            }
        } finally {
            //setIsLoading(false);
        }
    };

    const handleTableBackup = async () => {
        if (!selectedTableForBackup) return;

        setIsLoading(prev => ({ ...prev, backup: true }));
        try {
            const response = await axios.get(`${API_URL}/export/${selectedTableForBackup}`, {
                responseType: 'blob',
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${selectedTableForBackup}_backup_${new Date().toISOString()}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();

            setError(null);
        } catch (err) {
            handleApiError(err, 'Ошибка экспорта таблицы');
        } finally {
            setIsLoading(prev => ({ ...prev, backup: false }));
        }
    };

    const handleTableRestore = async () => {
        if (!selectedTableForBackup || !tableBackupFile) return;

        setIsLoading(prev => ({ ...prev, backup: true }));
        const formData = new FormData();
        formData.append('file', tableBackupFile);

        try {
            await axios.post(`${API_URL}/tables/${selectedTableForBackup}/restore`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            alert(`Таблица ${selectedTableForBackup} успешно восстановлена!`);
            setError(null);
        } catch (err) {
            handleApiError(err, 'Ошибка восстановления таблицы');
        } finally {
            setIsLoading(prev => ({ ...prev, backup: false }));
        }
    };

    const handleRowBackup = async () => {
        if (!selectedTableForBackup || !rowId) return;

        try {
            const response = await axios.get(`${API_URL}/tables/${selectedTableForBackup}/rows/${rowId}/backup`);

            // Создаем JSON файл с данными строки
            const dataStr = JSON.stringify(response.data, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = window.URL.createObjectURL(dataBlob);

            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${selectedTableForBackup}_row_${rowId}_backup.json`);
            document.body.appendChild(link);
            link.click();
            link.remove();

            setError(null);
        } catch (err) {
            handleApiError(err, 'Ошибка создания бэкапа строки');
        }
    };

    // const handleFullRestore = async () => {
    //     const fileInput = document.getElementById('restoreFile') as HTMLInputElement;
    //     if (!fileInput.files?.length) {
    //         setError('Выберите файл для восстановления');
    //         return;
    //     }
    //
    //     setIsLoading(prev => ({ ...prev, backup: true }));
    //     const formData = new FormData();
    //     formData.append('backup', fileInput.files[0]);
    //
    //     try {
    //         await axios.post(`${API_URL}/restore/table/:name`, formData, {
    //             headers: {
    //                 'Content-Type': 'multipart/form-data'
    //             }
    //         });
    //         alert('База данных успешно восстановлена!');
    //         fetchTables();
    //         setError(null);
    //     } catch (err) {
    //         handleApiError(err, 'Ошибка восстановления базы');
    //     } finally {
    //         setIsLoading(prev => ({ ...prev, backup: false }));
    //     }
    // };

    const handleCreateTable = async () => {
        // Валидация
        if (!newTable.name.trim()) {
            setError('Введите имя таблицы');
            return;
        }

        const invalidColumns = newTable.columns.filter(c => !c.name.trim());
        if (invalidColumns.length > 0) {
            setError(`Колонки ${invalidColumns.map((_, i) => i+1).join(', ')} не имеют имен`);
            return;
        }

        // Устанавливаем загрузку только для таблиц
        setIsLoading(prev => ({ ...prev, tables: true }));

        try {
            const requestData = {
                name: newTable.name.trim(),
                columns: newTable.columns.map(c => `${c.name.trim()}:${c.type}`)
            };

            const { data } = await axios.post<{
                status: string;
                table: string;
                meta_id?: number;
                error?: string;
            }>(`${API_URL}/tables`, requestData);

            if (data.error) {
                throw new Error(data.error);
            }

            // Успешное создание
            await fetchTables();
            setNewTable({
                name: '',
                columns: [{ id: uuidv4(), name: '', type: 'VARCHAR(255)' }]
            });
            setError(null);

        } catch (err) {
            const error = err as AxiosError<{
                error?: string;
                message?: string;
                details?: string;
            }> | Error;

            let errorMessage = 'Ошибка создания таблицы';

            if (axios.isAxiosError(error)) {
                errorMessage = error.response?.data?.error ||
                    error.response?.data?.message ||
                    errorMessage;

                if (error.response?.data?.details) {
                    errorMessage += ` (${error.response.data.details})`;
                }
            } else {
                errorMessage = error.message || errorMessage;
            }

            setError(errorMessage);
            console.error('Create table error:', error);

        } finally {
            setIsLoading(prev => ({ ...prev, tables: false }));
        }
    };

    const handleDropTable = async (name: string) => {
        if (!confirm(`Вы уверены, что хотите удалить таблицу ${name}?`)) return;

        try {
            await axios.delete(`${API_URL}/tables/${name}`);
            await fetchTables();
            setError(null);
        } catch (err) {
            handleApiError(err, 'Ошибка удаления таблицы');
        }
    };

    const executeQuery = async (query?: string) => {
        const queryToExecute = query || currentQuery;

        if (!queryToExecute?.trim()) {
            setError('Введите SQL запрос');
            return;
        }

        setIsLoading(prev => ({ ...prev, execution: true }));
        try {
            const { data } = await axios.post(`${API_URL}/queries/execute`, {
                query: queryToExecute.trim()
            });

            // Обновляем состояние с результатами
            setQueryResults(Array.isArray(data?.data) ? data.data : []);
            setError(null);

            // Обновляем статистику в списке запросов
            if (data.queryInfo) {
                setSavedQueries(prev => prev.map(q =>
                    q.id === data.queryInfo.id ? {
                        ...q,
                        useCount: data.queryInfo.useCount,
                        lastUsed: data.queryInfo.lastUsed
                    } : q
                ));
            }

            // Для нового запроса - сохраняем его
            if (!query) {
                await saveCurrentQuery();
            }
        } catch (err) {
            handleApiError(err, 'Ошибка выполнения запроса');
            setQueryResults([]);
        } finally {
            setIsLoading(prev => ({ ...prev, execution: false }));
        }
    };

    const saveCurrentQuery = async () => {
        if (!currentQuery?.trim()) return;

        try {
            const { data } = await axios.post(`${API_URL}/queries/save`, {
                query: currentQuery,
                name: queryName || `Query ${new Date().toLocaleString()}`
            });

            setSavedQueries(prev => [
                {
                    id: data.id,
                    query: currentQuery,
                    name: data.name || queryName,
                    lastUsed: new Date().toISOString(),
                    useCount: 1
                },
                ...prev.filter(q => q.id !== data.id)
            ]);
        } catch (err) {
            handleApiError(err, 'Ошибка сохранения запроса');
        }
    };

    const exportData = async (table: string) => {
        try {
            window.open(`${API_URL}/export/${table}`, '_blank');
        } catch (err) {
            handleApiError(err, 'Ошибка экспорта таблицы');
        }
    };

    const addColumn = () => {
        setNewTable(prev => ({
            ...prev,
            columns: [
                ...prev.columns,
                { id: uuidv4(), name: '', type: 'VARCHAR(255)' } // Новые колонки тоже получают уникальный id
            ]
        }));
    };

    const updateColumn = (index: number, field: keyof ColumnDefinition, value: string) => {
        setNewTable(prev => {
            const updatedColumns = [...prev.columns];
            updatedColumns[index] = {
                ...updatedColumns[index],
                [field]: value
            };
            return {
                ...prev,
                columns: updatedColumns
            };
        });
    };

    const removeColumn = (index: number) => {
        if (newTable.columns.length <= 1) return;

        setNewTable(prev => {
            const updatedColumns = [...prev.columns];
            updatedColumns.splice(index, 1);
            return {
                ...prev,
                columns: updatedColumns
            };
        });
    };

    return (
        <div className="container">
            <h1>Database Admin Panel</h1>

            {error && (
                <div className="error-message">
                    <span>{error}</span>
                    <button onClick={() => setError(null)}>×</button>
                </div>
            )}

            <div className="tabs">
                <button
                    className={activeTab === 'tables' ? 'active' : ''}
                    onClick={() => setActiveTab('tables')}
                    disabled={isLoading.tables}
                >
                    {isLoading.tables ? 'Загрузка...' : 'Таблицы'}
                </button>
                <button
                    className={activeTab === 'queries' ? 'active' : ''}
                    onClick={() => setActiveTab('queries')}
                    disabled={isLoading.queries}
                >
                    {isLoading.queries ? 'Загрузка...' : 'Запросы'}
                </button>
                <button
                    className={activeTab === 'backup' ? 'active' : ''}
                    onClick={() => setActiveTab('backup')}
                    disabled={isLoading.backup}
                >
                    {isLoading.backup ? 'Загрузка...' : 'Бэкап'}
                </button>

                <button
                    className={activeTab === 'table-manager' ? 'active' : ''}
                    onClick={() => setActiveTab('table-manager')}
                >
                    Управление таблицами
                </button>

            </div>

            {activeTab === 'tables' && (
                <div className="tab-content">
                    <h2>Управление таблицами</h2>
                    <div className="table-form">
                        <div className="form-group">
                            <label>Имя таблицы</label>
                            <input
                                value={newTable.name}
                                onChange={(e) => setNewTable(prev => ({
                                    ...prev,
                                    name: e.target.value
                                }))}
                                placeholder="Введите имя таблицы"
                            />
                        </div>

                        <div className="columns-section">
                            <label>Колонки</label>
                            {newTable.columns.map((col, i) => (
                                <div key={col.id} className="column-row"> {/* Используем col.id вместо индекса */}
                                    <input
                                        value={col.name}
                                        onChange={(e) => updateColumn(i, 'name', e.target.value)}
                                        placeholder={`Имя колонки ${i + 1}`}
                                    />
                                    <select
                                        value={col.type}
                                        onChange={(e) => updateColumn(i, 'type', e.target.value)}
                                    >
                                        {COLUMN_TYPES.map(type => (
                                            <option key={type} value={type}>{type}</option>
                                        ))}
                                    </select>
                                    <button
                                        className="remove-btn"
                                        onClick={() => removeColumn(i)}
                                        disabled={newTable.columns.length <= 1}
                                        title="Удалить колонку"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="form-actions">
                            <button className="secondary" onClick={addColumn}>
                                Добавить колонку
                            </button>
                            <button className="primary" onClick={handleCreateTable}>
                                Создать таблицу
                            </button>
                        </div>
                    </div>

                    <div className="table-list">
                        <h3>Существующие таблицы</h3>
                        {tables.length === 0 ? (
                            <p>Таблицы не найдены</p>
                        ) : (
                            <ul>
                                {tables.map((table) => (
                                    <li key={`table-${table}`}>
                                        <span>{table}</span>
                                        <div>
                                            <button
                                                className="export-btn"
                                                onClick={() => exportData(table)}
                                                title="Экспортировать данные"
                                            >
                                                Экспорт
                                            </button>
                                            <button
                                                className="delete-btn"
                                                onClick={() => handleDropTable(table)}
                                                title="Удалить таблицу"
                                            >
                                                Удалить
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'queries' && (
                <div className="tab-content">
                    <h2>Редактор запросов</h2>
                    <textarea
                        value={currentQuery || ''}
                        onChange={(e) => setCurrentQuery(e.target.value)}
                        rows={8}
                        placeholder="Введите SQL запрос..."
                        className="query-editor"
                    />

                    <div className="query-actions">
                        <button
                            className="execute-btn"
                            onClick={() => executeQuery(currentQuery)} // Выполняем текущий запрос
                            disabled={isLoading.execution || !currentQuery?.trim()}
                        >
                            {isLoading.execution ? 'Выполнение...' : 'Выполнить'}
                        </button>
                        <button
                            className="save-btn"
                            onClick={saveCurrentQuery}
                            disabled={!currentQuery?.trim()}
                        >
                        Сохранить запрос
                        </button>
                        {queryResults.length > 0 && (
                            <button
                                className="export-btn"
                                onClick={() => exportQueryResults(currentQuery)}
                            >
                                Экспорт результатов
                            </button>
                        )}
                    </div>

                    <div className="save-query-form">
                        <input
                            type="text"
                            value={queryName}
                            onChange={(e) => setQueryName(e.target.value)}
                            placeholder="Название запроса (необязательно)"
                        />
                    </div>

                    <div className="query-history">
                        <h3>Сохраненные запросы</h3>
                        {savedQueries.length === 0 ? (
                            <p>Нет сохраненных запросов</p>
                        ) : (
                            <div className="query-list">
                                {savedQueries.map(q => (
                                    <div key={q.id} className="query-item">
                                        <div className="query-header">
                                            <div className="query-title">
                                                <h4>{q.name}</h4>
                                                <span className="query-meta">
          Использовано: {q.useCount} раз, Последний: {new Date(q.lastUsed).toLocaleString()}
        </span>
                                            </div>
                                            <button
                                                className="delete-query-btn"
                                                onClick={() => deleteQuery(q.id)}
                                                title="Удалить запрос"
                                            >
                                                ×
                                            </button>
                                        </div>
                                        <pre className="query-sql">
          <code>{q.query}</code>
        </pre>
                                        <div className="query-actions">
                                            <button
                                                className="use-query-btn"
                                                onClick={() => {
                                                    setCurrentQuery(q.query);
                                                    setQueryName(q.name || '');
                                                }}
                                            >
                                                Загрузить
                                            </button>
                                            <button
                                                className="execute-query-btn"
                                                onClick={() => executeQuery(q.query)}
                                                disabled={isLoading.execution}
                                            >
                                                Выполнить
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {queryResults.length > 0 && (
                        <div className="query-results">
                            <h3>Результаты ({queryResults.length} строк)</h3>
                            <div className="table-container">
                            <table>
                                    <thead>
                                    <tr>
                                        {Object.keys(queryResults[0]).map((col) => (
                                            <th key={`th-${col}`}>{col}</th>
                                        ))}
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {queryResults.map((row, i) => (
                                        <tr key={`row-${i}`}>
                                            {Object.values(row).map((val, j) => (
                                                <td key={`cell-${i}-${j}`}>
                                                    {val !== null ? String(val) :
                                                        <span className="null-value">NULL</span>}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'backup' && (
                <div className="tab-content">
                    <h2>Резервное копирование и восстановление</h2>

                    {/* Секция полного бэкапа */}
                    <div className="backup-section">
                        <h3>Полный бэкап базы данных</h3>
                        <div className="backup-actions">
                            <button
                                className="backup-btn"
                                onClick={handleFullBackup}
                                disabled={isLoading.backup}
                            >
                                {isLoading.backup ? 'Создание...' : 'Создать полный бэкап'}
                            </button>
                            <p>Создает ZIP-архив со всеми таблицами и метаданными</p>
                        </div>
                    </div>

                    {/* Секция восстановления */}
                    <div className="restore-section">
                        <h3>Восстановление из бэкапа</h3>
                        <div className="file-upload">
                            <label htmlFor="restoreFile" className="file-upload-label">
                                <input
                                    type="file"
                                    id="restoreFile"
                                    accept=".zip"
                                    onChange={(e) => setBackupFile(e.target.files?.[0] || null)}
                                    className="file-input"
                                />
                                {backupFile ? backupFile.name : 'Выберите файл бэкапа (.zip)'}
                            </label>
                            <button
                                className="restore-btn"
                                onClick={handleFullRestore}
                                disabled={!backupFile || isLoading.backup}
                            >
                                {isLoading.backup ? 'Восстановление...' : 'Восстановить базу'}
                            </button>
                            <p className="warning">
                                Внимание: восстановление полностью перезапишет текущую базу данных!
                            </p>
                        </div>
                    </div>

                    {/* Секция бэкапа отдельных таблиц */}
                    <div className="table-backup-section">
                        <h3>Бэкап отдельных таблиц</h3>
                        <div className="table-selector">
                            <select
                                value={selectedTableForBackup || ''}
                                onChange={(e) => setSelectedTableForBackup(e.target.value)}
                                disabled={tables.length === 0}
                            >
                                <option value="">Выберите таблицу</option>
                                {tables.map(table => (
                                    <option key={table} value={table}>{table}</option>
                                ))}
                            </select>
                            <button
                                className="backup-table-btn"
                                onClick={handleTableBackup}
                                disabled={!selectedTableForBackup || isLoading.backup}
                            >
                                {isLoading.backup ? 'Экспорт...' : 'Экспортировать таблицу'}
                            </button>
                        </div>
                        <div className="table-restore">
                            <input
                                type="file"
                                id="tableRestoreFile"
                                accept=".csv"
                                onChange={(e) => setTableBackupFile(e.target.files?.[0] || null)}
                                className="file-input"
                                disabled={!selectedTableForBackup}
                            />
                            <button
                                className="restore-table-btn"
                                onClick={handleTableRestore}
                                disabled={!selectedTableForBackup || !tableBackupFile || isLoading.backup}
                            >
                                {isLoading.backup ? 'Импорт...' : 'Импортировать в таблицу'}
                            </button>
                        </div>
                    </div>

                    {/* Секция бэкапа строк */}
                    {selectedTableForBackup && (
                        <div className="row-backup-section">
                            <h3>Бэкап отдельных строк</h3>
                            <div className="row-backup-controls">
                                <input
                                    type="text"
                                    placeholder="ID строки"
                                    value={rowId}
                                    onChange={(e) => setRowId(e.target.value)}
                                />
                                <button
                                    className="backup-row-btn"
                                    onClick={handleRowBackup}
                                    disabled={!rowId}
                                >
                                    Создать бэкап строки
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'table-manager' && (
                <div className="tab-content">
                    <TableManager />
                </div>
            )}

            <style>{`
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          color: #333;
        }
        
        h1 {
          color: #2c3e50;
          text-align: center;
          margin-bottom: 30px;
        }
        
        h2, h3, h4 {
          color: #34495e;
          margin-top: 0;
        }
        
        .error-message {
          background: #ffebee;
          color: #c62828;
          padding: 12px 15px;
          border-radius: 4px;
          margin-bottom: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-left: 4px solid #c62828;
        }
        
        .error-message button {
          background: none;
          border: none;
          font-size: 18px;
          cursor: pointer;
          color: #c62828;
          padding: 0 5px;
        }
        
        .tabs {
          display: flex;
          margin-bottom: 20px;
          border-bottom: 1px solid #ddd;
        }
        
        .tabs button {
          padding: 10px 20px;
          background: none;
          border: none;
          cursor: pointer;
          font-size: 16px;
          color: #7f8c8d;
          position: relative;
          transition: all 0.3s ease;
        }
        
        .tabs button:hover:not(:disabled) {
          color: #3498db;
        }
        
        .tabs button.active {
          color: #2980b9;
          font-weight: 600;
        }
        
        .tabs button.active::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 0;
          right: 0;
          height: 3px;
          background: #2980b9;
        }
        
        .tabs button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        .tab-content {
          background: #fff;
          padding: 25px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.08);
          margin-bottom: 30px;
        }
        
        .table-form {
          margin-bottom: 30px;
          background: #f9f9f9;
          padding: 20px;
          border-radius: 6px;
        }
        
        .form-group {
          margin-bottom: 15px;
        }
        
        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          color: #2c3e50;
        }
        
        .form-group input {
          width: 100%;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 15px;
          transition: border 0.3s;
        }
        
        .form-group input:focus {
          border-color: #3498db;
          outline: none;
          box-shadow: 0 0 0 2px rgba(52,152,219,0.2);
        }
        
        .columns-section {
          margin: 25px 0;
        }
        
        .columns-section label {
          display: block;
          margin-bottom: 10px;
          font-weight: 600;
          color: #2c3e50;
        }
        
        .column-row {
          display: flex;
          gap: 10px;
          margin-bottom: 10px;
          align-items: center;
        }
        
        .column-row input {
          flex: 1;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 15px;
        }
        
        .column-row select {
          width: 200px;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          background: white;
          font-size: 15px;
        }
        
        .remove-btn {
          background: #e74c3c;
          color: white;
          border: none;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          cursor: pointer;
          font-size: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }
        
        .remove-btn:hover:not(:disabled) {
          background: #c0392b;
        }
        
        .remove-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .form-actions {
          display: flex;
          gap: 12px;
          margin-top: 20px;
        }
        
        button {
          padding: 10px 18px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 15px;
          font-weight: 500;
          transition: all 0.2s;
          border: 1px solid transparent;
        }
        
        button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        
        .primary {
          background: #3498db;
          color: white;
        }
        
        .primary:hover:not(:disabled) {
          background: #2980b9;
        }
        
        .secondary {
          background: #ecf0f1;
          border-color: #bdc3c7;
          color: #2c3e50;
        }
        
        .secondary:hover:not(:disabled) {
          background: #dfe6e9;
        }
        
        .table-list ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        
        .table-list li {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 15px;
          border-bottom: 1px solid #eee;
          transition: background 0.2s;
        }
        
        .table-list li:hover {
          background: #f8f9fa;
        }
        
        .table-list li > div {
          display: flex;
          gap: 8px;
        }
        
        .export-btn {
          background: #2ecc71;
          color: white;
        }
        
        .export-btn:hover:not(:disabled) {
          background: #27ae60;
        }
        
        .delete-btn {
          background: #e74c3c;
          color: white;
        }
        
        .delete-btn:hover:not(:disabled) {
          background: #c0392b;
        }
        
        .query-editor {
          width: 100%;
          padding: 15px;
          border: 1px solid #ddd;
          border-radius: 4px;
          margin-bottom: 15px;
          min-height: 150px;
          font-family: 'Consolas', 'Monaco', monospace;
          font-size: 14px;
          line-height: 1.5;
          resize: vertical;
        }
        
        .query-actions {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }
        
        .execute-btn {
          background: #3498db;
          color: white;
        }
        
        .execute-btn:hover:not(:disabled) {
          background: #2980b9;
        }
        
        .save-btn {
          background: #2ecc71;
          color: white;
        }
        
        .save-btn:hover:not(:disabled) {
          background: #27ae60;
        }
        
        .save-query-form {
          margin-bottom: 25px;
        }
        
        .save-query-form input {
          width: 100%;
          padding: 10px 15px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 15px;
        }
        
        .query-history {
          margin-top: 30px;
        }
        
        .query-list {
          max-height: 500px;
          overflow-y: auto;
          border: 1px solid #eee;
          border-radius: 6px;
          background: #fcfcfc;
        }
        
        .query-item {
          padding: 18px;
          border-bottom: 1px solid #eee;
        }
        
        .query-item:last-child {
          border-bottom: none;
        }
        
        .query-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 12px;
          align-items: flex-start;
        }
        
        .query-title h4 {
          margin: 0 0 5px 0;
          color: #2c3e50;
        }
        
        .query-meta {
          color: #7f8c8d;
          font-size: 0.85em;
        }
        
        .query-sql {
          background: #f8f9fa;
          padding: 12px;
          border-radius: 4px;
          margin: 12px 0;
          white-space: pre-wrap;
          overflow-x: auto;
          font-family: 'Consolas', 'Monaco', monospace;
          font-size: 14px;
          line-height: 1.4;
          border-left: 3px solid #3498db;
        }
        
        .delete-query-btn {
          background: none;
          border: none;
          color: #95a5a6;
          font-size: 18px;
          cursor: pointer;
          padding: 0 5px;
          margin-left: 10px;
        }
        
        .delete-query-btn:hover {
          color: #e74c3c;
        }
        
        .query-actions {
          display: flex;
          gap: 8px;
          margin-top: 10px;
        }
        
        .use-query-btn {
          background: #3498db;
          color: white;
          padding: 8px 12px;
          font-size: 14px;
        }
        
        .execute-query-btn {
          background: #2ecc71;
          color: white;
          padding: 8px 12px;
          font-size: 14px;
        }
        
        .export-query-btn {
          background: #9b59b6;
          color: white;
          padding: 8px 12px;
          font-size: 14px;
        }
        
        .query-results {
          margin-top: 30px;
        }
        
        .table-container {
          max-height: 500px;
          overflow: auto;
          margin: 20px 0;
          border: 1px solid #ddd;
          border-radius: 6px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }
        
        th, td {
          padding: 12px 15px;
          border: 1px solid #ddd;
          text-align: left;
        }
        
        th {
          background: #f8f9fa;
          position: sticky;
          top: 0;
          font-weight: 600;
          color: #2c3e50;
        }
        
        tr:nth-child(even) {
          background-color: #f9f9f9;
        }
        
        tr:hover {
          background-color: #f1f1f1;
        }
        
        .null-value {
          color: #95a5a6;
          font-style: italic;
        }
        
        .backup-section, .restore-section {
          margin-bottom: 30px;
          padding: 20px;
          background: #f9f9f9;
          border-radius: 6px;
        }
        
        .backup-btn {
          background: #3498db;
          color: white;
          padding: 12px 20px;
          font-size: 16px;
        }
        
        .restore-btn {
          background: #2ecc71;
          color: white;
          padding: 12px 20px;
          font-size: 16px;
          margin-top: 15px;
          display: block;
        }
        
        .file-input {
          display: block;
          margin: 10px 0;
          padding: 10px;
          border: 1px dashed #95a5a6;
          border-radius: 4px;
          width: 100%;
          max-width: 400px;
        }
        
        .warning {
          color: #e74c3c;
          font-size: 0.9em;
          margin-top: 10px;
        }
        
        @media (max-width: 768px) {
          .container {
            padding: 10px;
          }
          
          .column-row {
            flex-direction: column;
            align-items: stretch;
            gap: 8px;
          }
          
          .column-row select {
            width: 100%;
          }
          
          .tabs {
            flex-wrap: wrap;
          }
          
          .tabs button {
            flex: 1;
            min-width: 100px;
            text-align: center;
          }
          
          .query-actions {
            flex-direction: column;
          }
          
          .query-actions button {
            width: 100%;
          }
          .backup-section, 
.restore-section, 
.table-backup-section,
.row-backup-section {
  margin-bottom: 30px;
  padding: 20px;
  background: #f9f9f9;
  border-radius: 6px;
}

.file-upload-label {
  display: block;
  padding: 12px;
  border: 1px dashed #95a5a6;
  border-radius: 4px;
  cursor: pointer;
  margin-bottom: 10px;
  text-align: center;
  transition: all 0.3s;
}

.file-upload-label:hover {
  background: #f0f0f0;
}

.file-input {
  display: none;
}

.table-selector {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
}

.table-selector select {
  flex: 1;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.row-backup-controls {
  display: flex;
  gap: 10px;
}

.row-backup-controls input {
  flex: 1;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.backup-btn, 
.restore-btn,
.backup-table-btn,
.restore-table-btn,
.backup-row-btn {
  padding: 10px 20px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

.backup-btn, 
.backup-table-btn {
  background: #3498db;
  color: white;
}

.backup-btn:hover:not(:disabled),
.backup-table-btn:hover:not(:disabled) {
  background: #2980b9;
}

.restore-btn,
.restore-table-btn {
  background: #2ecc71;
  color: white;
}

.restore-btn:hover:not(:disabled),
.restore-table-btn:hover:not(:disabled) {
  background: #27ae60;
}

.backup-row-btn {
  background: #9b59b6;
  color: white;
}

.backup-row-btn:hover:not(:disabled) {
  background: #8e44ad;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.warning {
  color: #e74c3c;
  font-size: 0.9em;
  margin-top: 10px;
}
        }
      `}</style>
        </div>
    );
}

export default App;