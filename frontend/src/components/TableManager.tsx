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
    const [newRow, setNewRow] = useState<Record<string, any>>({});
    const [editingRow, setEditingRow] = useState<{id: string | null, data: Record<string, any>} | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<{type: 'column' | 'row', name: string, id?: string} | null>(null);

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
            if (response.data) {
                setTableData(response.data);
                // Initialize newRow with empty values
                const emptyRow: Record<string, any> = {};
                response.data.columns.forEach(col => emptyRow[col] = '');
                setNewRow(emptyRow);
            } else {
                setTableData({ columns: [], rows: [] });
            }
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
    const handleDeleteColumn = async () => {
        if (!confirmDelete || confirmDelete.type !== 'column') return;

        try {
            await axios.delete(`${API_URL}/tables/${selectedTable}/columns/${confirmDelete.name}`);
            loadTableData(selectedTable);
            setConfirmDelete(null);
        } catch (error) {
            console.error('Ошибка удаления колонки:', error);
        }
    };

    // Добавление строки
    const handleAddRow = async () => {
        try {
            // Преобразуем пустые строки в NULL для числовых полей
            const processedRow = { ...newRow };
            tableData.columns.forEach(col => {
                if (processedRow[col] === '') {
                    processedRow[col] = null;
                }
            });

            await axios.post(`${API_URL}/tables/${selectedTable}/rows`, processedRow);
            loadTableData(selectedTable);
            // Сбрасываем форму добавления
            const emptyRow: Record<string, any> = {};
            tableData.columns.forEach(col => emptyRow[col] = '');
            setNewRow(emptyRow);
        } catch (error) {
            console.error('Ошибка добавления строки:', error);
        }
    };

    // Обновление строки
    const handleUpdateRow = async () => {
        if (!editingRow) return;

        try {
            await axios.put(
                `${API_URL}/tables/${selectedTable}/rows/${editingRow.id}`,
                editingRow.data
            );
            loadTableData(selectedTable);
            setEditingRow(null);
        } catch (error) {
            console.error('Ошибка обновления строки:', error);
        }
    };

    // Удаление строки
    const handleDeleteRow = async () => {
        if (!confirmDelete || confirmDelete.type !== 'row' || !confirmDelete.id) return;

        try {
            await axios.delete(`${API_URL}/tables/${selectedTable}/rows/${confirmDelete.id}`);
            loadTableData(selectedTable);
            setConfirmDelete(null);
        } catch (error) {
            console.error('Ошибка удаления строки:', error);
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

    // Получение ID строки (используем первое поле или поле 'id')
    const getRowId = (row: Record<string, any>) => {
        return row.id || row[Object.keys(row)[0]];
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
                    <div className="table-header">
                        <h3>{selectedTable}</h3>

                        <div className="table-actions">
                            <button onClick={backupTable}>Создать бэкап</button>
                            <div className="file-upload">
                                <label>
                                    Восстановить из файла
                                    <input
                                        type="file"
                                        onChange={e => e.target.files && restoreTable(e.target.files[0])}
                                        style={{ display: 'none' }}
                                    />
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Добавление колонки */}
                    <div className="section">
                        <h4>Добавить колонку</h4>
                        <div className="form-row">
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
                    </div>

                    {/* Добавление строки */}
                    <div className="section">
                        <h4>Добавить строку</h4>
                        <div className="form-grid">
                            {tableData.columns.map(column => (
                                <div key={`new-${column}`} className="form-field">
                                    <label>{column}</label>
                                    <input
                                        type="text"
                                        value={newRow[column] || ''}
                                        onChange={(e) => setNewRow({
                                            ...newRow,
                                            [column]: e.target.value
                                        })}
                                        placeholder={column}
                                    />
                                </div>
                            ))}
                        </div>
                        <button onClick={handleAddRow}>Добавить строку</button>
                    </div>

                    {/* Таблица данных */}
                    <div className="section">
                        <h4>Данные таблицы</h4>
                        <div className="table-wrapper">
                            <table>
                                <thead>
                                <tr>
                                    {tableData.columns && tableData.columns.length > 0 ? (
                                        tableData.columns.map(column => (
                                            <th key={column}>
                                                <div className="column-header">
                                                    <span>{column}</span>
                                                    <button
                                                        className="icon-btn danger"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setConfirmDelete({
                                                                type: 'column',
                                                                name: column
                                                            });
                                                        }}
                                                        title="Удалить колонку"
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            </th>
                                        ))
                                    ) : (
                                        <th>Нет колонок</th>
                                    )}
                                    <th>Действия</th>
                                </tr>
                                </thead>
                                <tbody>
                                {tableData.rows && tableData.rows.length > 0 ? (
                                    tableData.rows.map((row, i) => (
                                        <tr key={i}>
                                            {tableData.columns.map(column => (
                                                <td key={`${i}-${column}`}>
                                                    {row[column] !== null ? String(row[column]) : 'NULL'}
                                                </td>
                                            ))}
                                            <td className="actions">
                                                <button
                                                    className="icon-btn primary"
                                                    onClick={() => setEditingRow({
                                                        id: getRowId(row),
                                                        data: {...row}
                                                    })}
                                                    title="Редактировать"
                                                >
                                                    ✏️
                                                </button>
                                                <button
                                                    className="icon-btn danger"
                                                    onClick={() => setConfirmDelete({
                                                        type: 'row',
                                                        name: `строку #${getRowId(row)}`,
                                                        id: getRowId(row)
                                                    })}
                                                    title="Удалить"
                                                >
                                                    🗑️
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={tableData.columns.length + 1} className="empty">
                                            Нет данных
                                        </td>
                                    </tr>
                                )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Модальное окно редактирования */}
                    {editingRow && (
                        <div className="modal-overlay">
                            <div className="modal">
                                <h3>Редактирование строки</h3>
                                <div className="form-grid">
                                    {tableData.columns.map(column => (
                                        <div key={`edit-${column}`} className="form-field">
                                            <label>{column}</label>
                                            <input
                                                type="text"
                                                value={editingRow.data[column] ?? ''}
                                                onChange={(e) => setEditingRow({
                                                    ...editingRow,
                                                    data: {
                                                        ...editingRow.data,
                                                        [column]: e.target.value
                                                    }
                                                })}
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div className="modal-actions">
                                    <button className="primary" onClick={handleUpdateRow}>
                                        Сохранить
                                    </button>
                                    <button onClick={() => setEditingRow(null)}>
                                        Отмена
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Модальное окно подтверждения удаления */}
                    {confirmDelete && (
                        <div className="modal-overlay">
                            <div className="modal">
                                <h3>Подтверждение удаления</h3>
                                <p>Вы уверены, что хотите удалить {confirmDelete.name}?</p>
                                <div className="modal-actions">
                                    <button
                                        className="danger"
                                        onClick={confirmDelete.type === 'column' ? handleDeleteColumn : handleDeleteRow}
                                    >
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

            <style>{`
                .table-manager {
                    display: flex;
                    min-height: 100vh;
                    font-family: Arial, sans-serif;
                }
                
                .table-list {
                    width: 250px;
                    padding: 20px;
                    background: #f8f9fa;
                    border-right: 1px solid #dee2e6;
                }
                
                .table-list ul {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                }
                
                .table-list li {
                    padding: 10px 15px;
                    cursor: pointer;
                    border-radius: 4px;
                    margin-bottom: 5px;
                    transition: background 0.2s;
                }
                
                .table-list li:hover {
                    background: #e9ecef;
                }
                
                .table-list li.active {
                    background: #007bff;
                    color: white;
                }
                
                .table-content {
                    flex: 1;
                    padding: 20px;
                    overflow-x: auto;
                }
                
                .table-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                }
                
                .table-actions {
                    display: flex;
                    gap: 10px;
                }
                
                .file-upload label {
                    display: inline-block;
                    padding: 8px 15px;
                    background: #28a745;
                    color: white;
                    border-radius: 4px;
                    cursor: pointer;
                    transition: background 0.2s;
                }
                
                .file-upload label:hover {
                    background: #218838;
                }
                
                .section {
                    margin-bottom: 30px;
                    padding: 20px;
                    background: white;
                    border-radius: 5px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                
                .form-row, .modal-actions {
                    display: flex;
                    gap: 10px;
                    margin-top: 15px;
                }
                
                .form-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 15px;
                    margin-bottom: 15px;
                }
                
                .form-field {
                    display: flex;
                    flex-direction: column;
                }
                
                .form-field label {
                    font-size: 12px;
                    margin-bottom: 5px;
                    color: #6c757d;
                }
                
                input, select {
                    padding: 8px 12px;
                    border: 1px solid #ced4da;
                    border-radius: 4px;
                    font-size: 14px;
                }
                
                button {
                    padding: 8px 15px;
                    border: none;
                    border-radius: 4px;
                    background: #6c757d;
                    color: white;
                    cursor: pointer;
                    font-size: 14px;
                    transition: background 0.2s;
                }
                
                button:hover {
                    background: #5a6268;
                }
                
                button.primary {
                    background: #007bff;
                }
                
                button.primary:hover {
                    background: #0069d9;
                }
                
                button.danger {
                    background: #dc3545;
                }
                
                button.danger:hover {
                    background: #c82333;
                }
                
                .icon-btn {
                    background: none;
                    border: none;
                    padding: 5px;
                    font-size: 16px;
                    cursor: pointer;
                }
                
                .icon-btn.danger {
                    color: #dc3545;
                }
                
                .icon-btn.primary {
                    color: #007bff;
                }
                
                .table-wrapper {
                    overflow-x: auto;
                    margin-top: 15px;
                }
                
                table {
                    width: 100%;
                    border-collapse: collapse;
                }
                
                th, td {
                    padding: 12px 15px;
                    text-align: left;
                    border-bottom: 1px solid #dee2e6;
                }
                
                th {
                    background: #f8f9fa;
                    position: sticky;
                    top: 0;
                }
                
                tr:hover {
                    background: #f8f9fa;
                }
                
                .column-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .actions {
                    display: flex;
                    gap: 5px;
                    justify-content: center;
                }
                
                .empty {
                    text-align: center;
                    color: #6c757d;
                    padding: 20px;
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
                    padding: 25px;
                    border-radius: 5px;
                    min-width: 500px;
                    max-width: 90%;
                    max-height: 90vh;
                    overflow-y: auto;
                }
            `}</style>
        </div>
    );
};

export default TableManager;