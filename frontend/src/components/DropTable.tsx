import { FC, useState } from "react";
import { Button, TextField, Snackbar } from "@mui/material";
import { dropTable } from "../api";

const DropTable: FC = () => {
    const [tableName, setTableName] = useState("");
    const [message, setMessage] = useState("");
    const [open, setOpen] = useState(false);

    const handleDropTable = async () => {
        try {
            await dropTable(tableName);
            setMessage("Таблица удалена успешно!");
            setOpen(true);
        } catch (error) {
            setMessage("Ошибка при удалении таблицы");
            setOpen(true);
        }
    };

    return (
        <div className="p-4">
            <h3>Удаление таблицы</h3>
            <TextField
                label="Имя таблицы"
                variant="outlined"
                fullWidth
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
            />
            <Button onClick={handleDropTable} variant="contained" color="secondary" className="mt-4">
                Удалить таблицу
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

export default DropTable;
