import { FC, useState } from "react";
import { Button, TextField, Snackbar, Typography } from "@mui/material";
import { runQuery } from "../../api.ts";

const QueryExecutor: FC = () => {
    const [sql, setSql] = useState("");
    const [message, setMessage] = useState("");
    const [open, setOpen] = useState(false);
    const [results, setResults] = useState<any[]>([]);

    const handleRunQuery = async () => {
        try {
            const result = await runQuery(sql);
            setResults(result.data);
            setMessage("Запрос выполнен успешно!");
            setOpen(true);
        } catch (error) {
            setMessage("Ошибка при выполнении запроса");
            setOpen(true);
        }
    };

    return (
        <div className="p-4">
            <h3>Выполнение SQL-запроса</h3>
            <TextField
                label="SQL запрос"
                variant="outlined"
                fullWidth
                value={sql}
                onChange={(e) => setSql(e.target.value)}
                multiline
                rows={4}
            />
            <Button onClick={handleRunQuery} variant="contained" color="primary" className="mt-4">
                Выполнить запрос
            </Button>

            <Snackbar
                open={open}
                autoHideDuration={3000}
                onClose={() => setOpen(false)}
                message={message}
            />

            {results.length > 0 && (
                <div className="mt-4">
                    <Typography variant="h6">Результаты:</Typography>
                    <pre>{JSON.stringify(results, null, 2)}</pre>
                </div>
            )}
        </div>
    );
};

export default QueryExecutor;
