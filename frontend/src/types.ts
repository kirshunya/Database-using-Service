
export type ColumnType =
    | 'INTEGER' | 'SERIAL' | 'VARCHAR(255)'
    | 'TEXT' | 'BOOLEAN' | 'DATE'
    | 'TIMESTAMP' | 'FLOAT' | 'JSON' | 'UUID';

export interface ColumnDefinition {
    id: string;  // Добавляем обязательное поле id
    name: string;
    type: ColumnType;
}

export interface TableDefinition {
    name: string;
    columns: ColumnDefinition[];
}