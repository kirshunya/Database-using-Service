import { useState } from 'react';
import api from '../../api/client.ts';

export default function SqlConsole() {
    const [sqlQuery, setSqlQuery] = useState<string>('SELECT * FROM employee;');
    const [results, setResults] = useState<any[]>([]);
    const [error, setError] = useState<string>('');

    const executeQuery = async () => {
        if (!sqlQuery.trim()) {
            setError('Бро, запрос пустой!');
            return;
        }

        try {
            const response = await api.post('/query', {
                query: sqlQuery.trim()
            });
            setResults(response.data.data);
            setError('');
        } catch (err: any) {
            setError(err.response?.data?.error || err.message);
            setResults([]); // Очищаем результаты при ошибке
        }
    };

    return (
        <div>
      <textarea
          value={sqlQuery}
          onChange={(e) => setSqlQuery(e.target.value)}
          placeholder="SELECT * FROM employees;"
          style={{ width: '100%', height: '100px' }}
      />
            <button onClick={executeQuery}>Выполнить</button>

            {error && <div style={{ color: 'red' }}>{error}</div>}

            {/* Выводим результаты только если они есть */}
            {results.length > 0 && (
                <table style={{ width: '100%', marginTop: '20px', borderCollapse: 'collapse' }}>
                    <thead>
                    <tr>
                        {Object.keys(results[0]).map((column) => (
                            <th key={column} style={{ border: '1px solid #ddd', padding: '8px', backgroundColor: '#f2f2f2' }}>
                                {column}
                            </th>
                        ))}
                    </tr>
                    </thead>
                    <tbody>
                    {results.map((row, index) => (
                        <tr key={index}>
                            {Object.values(row).map((value, i) => (
                                <td key={i} style={{ border: '1px solid #ddd', padding: '8px' }}>
                                    {String(value)}
                                </td>
                            ))}
                        </tr>
                    ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}