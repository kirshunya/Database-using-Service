import { FC, useState } from "react";
import { Button, TextField, Snackbar } from "@mui/material";
import { createTable } from "../../api.ts";

const TableOperations: FC = () => {
    const [sql, setSql] = useState("");
    const [message, setMessage] = useState("");
    const [open, setOpen] = useState(false);

    const handleCreateTable = async () => {
        try {
            await createTable(sql);
            setMessage("Таблица создана успешно!");
            setOpen(true);
        } catch (error) {
            setMessage("Ошибка при создании таблицы");
            setOpen(true);
        }
    };

    return (
        <div className="p-4">
            <h3>Создание таблицы</h3>
            <TextField
                label="SQL для создания таблицы"
                variant="outlined"
                fullWidth
                value={sql}
                onChange={(e) => setSql(e.target.value)}
                multiline
                rows={4}
            />
            <Button onClick={handleCreateTable} variant="contained" color="primary" className="mt-4">
                Создать таблицу
            </Button>

            <Snackbar
                open={open}
                autoHideDuration={3000}
                onClose={() => setOpen(false)}
                message={message}
            />
        </div>
    );
};

export default TableOperations;
