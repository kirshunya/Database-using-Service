// TableManager.tsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:8081/api';

const COLUMN_TYPES = [
    'INTEGER', 'SERIAL', 'VARCHAR(255)', 'TEXT', 'BOOLEAN',
    'DATE', 'TIMESTAMP', 'FLOAT', 'JSON', 'UUID'
] as const;

interface TableData {
    columns: string[];
    rows: Record<string, any>[];
}

const TableManager: React.FC = () => {
    const [tables, setTables] = useState<string[]>([]);
    const [selectedTable, setSelectedTable] = useState<string>('');
    const [tableData, setTableData] = useState<TableData>({ columns: [], rows: [] });
    const [newColumn, setNewColumn] = useState({ name: '', type: 'TEXT' });
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    // Загрузка списка таблиц
    useEffect(() => {
        const fetchTables = async () => {
            try {
                const response = await axios.get<string[]>(`${API_URL}/tables`);
                setTables(response.data);
            } catch (error) {
                console.error('Ошибка загрузки таблиц:', error);
            }
        };
        fetchTables();
    }, []);

    // Загрузка данных таблицы
    const loadTableData = async (tableName: string) => {
        try {
            const response = await axios.get<TableData>(`${API_URL}/tables/${tableName}/data`);
            setTableData(response.data || { columns: [], rows: [] });
            setSelectedTable(tableName);
        } catch (error) {
            console.error('Ошибка загрузки данных таблицы:', error);
            setTableData({ columns: [], rows: [] });
        }
    };

    // Добавление колонки
    const handleAddColumn = async () => {
        if (!newColumn.name.trim()) return;

        try {
            await axios.post(`${API_URL}/tables/${selectedTable}/columns`, {
                name: newColumn.name,
                type: newColumn.type
            });
            loadTableData(selectedTable);
            setNewColumn({ name: '', type: 'TEXT' });
        } catch (error) {
            console.error('Ошибка добавления колонки:', error);
        }
    };

    // Удаление колонки
    const handleDeleteColumn = async (columnName: string) => {
        try {
            await axios.delete(`${API_URL}/tables/${selectedTable}/columns/${columnName}`);
            loadTableData(selectedTable);
            setConfirmDelete(null);
        } catch (error) {
            console.error('Ошибка удаления колонки:', error);
        }
    };

    // Создание резервной копии таблицы
    const backupTable = async () => {
        try {
            const response = await axios.get(`${API_URL}/tables/${selectedTable}/backup`, {
                responseType: 'blob'
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${selectedTable}_backup_${new Date().toISOString()}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error('Ошибка создания бэкапа:', error);
        }
    };

    // Восстановление таблицы
    const restoreTable = async (file: File) => {
        const formData = new FormData();
        formData.append('backup', file);

        try {
            await axios.post(`${API_URL}/tables/${selectedTable}/restore`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });
            loadTableData(selectedTable);
        } catch (error) {
            console.error('Ошибка восстановления:', error);
        }
    };

    return (
        <div className="table-manager">
            <div className="table-list">
                <h3>Таблицы</h3>
                <ul>
                    {tables.map(table => (
                        <li
                            key={table}
                            className={selectedTable === table ? 'active' : ''}
                            onClick={() => loadTableData(table)}
                        >
                            {table}
                        </li>
                    ))}
                </ul>
            </div>

            {selectedTable && (
                <div className="table-content">
                    <h3>{selectedTable}</h3>

                    {/* Управление таблицей */}
                    <div className="table-actions">
                        <button onClick={backupTable}>Создать бэкап</button>
                        <input
                            type="file"
                            onChange={e => e.target.files && restoreTable(e.target.files[0])}
                        />
                    </div>

                    {/* Добавление колонки */}
                    <div className="add-column">
                        <input
                            value={newColumn.name}
                            onChange={e => setNewColumn({...newColumn, name: e.target.value})}
                            placeholder="Имя колонки"
                        />
                        <select
                            value={newColumn.type}
                            onChange={e => setNewColumn({...newColumn, type: e.target.value})}
                        >
                            {COLUMN_TYPES.map(type => (
                                <option key={type} value={type}>{type}</option>
                            ))}
                        </select>
                        <button onClick={handleAddColumn}>Добавить</button>
                    </div>

                    {/* Данные таблицы */}
                    <div className="table-data">
                        <table>
                            <thead>
                            <tr>
                                {tableData.columns.map(column => (
                                    <th key={column}>
                                        <div className="column-header">
                                            <span>{column}</span>
                                            <button
                                                className="delete-column-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setConfirmDelete(column);
                                                }}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                            </thead>
                            <tbody>
                            {tableData?.rows?.map((row, i) => (
                                <tr key={i}>
                                    {tableData.columns.map(column => (
                                        <td key={`${i}-${column}`}>
                                            {row[column] !== null ? String(row[column]) : 'NULL'}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Модальное окно подтверждения удаления */}
                    {confirmDelete && (
                        <div className="modal-overlay">
                            <div className="modal">
                                <p>Вы уверены, что хотите удалить колонку "{confirmDelete}"?</p>
                                <div className="modal-actions">
                                    <button onClick={() => handleDeleteColumn(confirmDelete)}>
                                        Удалить
                                    </button>
                                    <button onClick={() => setConfirmDelete(null)}>
                                        Отмена
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Стили */}
            <style>{`
                .table-manager {
                    display: flex;
                    gap: 20px;
                    padding: 20px;
                }
                .table-list {
                    width: 200px;
                    border-right: 1px solid #ccc;
                    padding-right: 20px;
                }
                .table-list ul {
                    list-style: none;
                    padding: 0;
                }
                .table-list li {
                    padding: 8px;
                    cursor: pointer;
                }
                .table-list li.active {
                    background-color: #f0f0f0;
                    font-weight: bold;
                }
                .table-content {
                    flex: 1;
                }
                .add-column {
                    margin: 15px 0;
                    display: flex;
                    gap: 10px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                }
                th, td {
                    border: 1px solid #ddd;
                    padding: 8px;
                    text-align: left;
                }
                th {
                    background-color: #f2f2f2;
                }
                .column-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .delete-column-btn {
                    background: none;
                    border: none;
                    color: #ff4444;
                    cursor: pointer;
                    font-size: 16px;
                    padding: 0 5px;
                }
                .modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0,0,0,0.5);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 1000;
                }
                .modal {
                    background: white;
                    padding: 20px;
                    border-radius: 5px;
                    min-width: 300px;
                }
                .modal-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                    margin-top: 20px;
                }
            `}</style>
        </div>
    );
};

export default TableManager;